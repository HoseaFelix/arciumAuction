import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Connection, Keypair } from "@solana/web3.js";
import {
  buildFinalizeCompDefTx,
  getCompDefAccOffset,
  uploadCircuit,
} from "@arcium-hq/client";

function loadLocalEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (!process.env[key]) {
        process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
      }
    }
  } catch (_err) {
    // .env.local is optional for this script.
  }
}

function expandHome(filePath) {
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith("~/")) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

function buildProvider() {
  loadLocalEnv();
  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL ||
    process.env.SOLANA_RPC_URL ||
    "https://api.devnet.solana.com";
  const walletPath = expandHome(
    process.env.ANCHOR_WALLET ||
      process.env.SOLANA_WALLET ||
      "~/.config/solana/id.json"
  );
  const secretKey = JSON.parse(readFileSync(walletPath, "utf8"));
  const wallet = new anchor.Wallet(Keypair.fromSecretKey(Uint8Array.from(secretKey)));
  return new anchor.AnchorProvider(new Connection(rpcUrl, "confirmed"), wallet, {
    commitment: "confirmed",
  });
}

function toU32LE(bytes) {
  return ((bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0);
}

async function run() {
  const provider = buildProvider();
  anchor.setProvider(provider);

  const program = anchor.workspace.Auction;

  const circuits = [
    { name: "init_auction_state", file: "build/init_auction_state.arcis" },
    { name: "place_bid_v2", file: "build/place_bid_v2.arcis" },
    { name: "determine_winner_first_price", file: "build/determine_winner_first_price.arcis" },
    { name: "determine_winner_vickrey", file: "build/determine_winner_vickrey.arcis" },
  ];
  const onlyRaw = process.env.ARCIUM_CIRCUITS;
  const only =
    onlyRaw
      ? new Set(
          onlyRaw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        )
      : null;

  for (const c of circuits) {
    if (only && !only.has(c.name)) {
      console.log(`[skip] ${c.name}: not in ARCIUM_CIRCUITS`);
      continue;
    }
    const raw = readFileSync(c.file);
    const compDefOffset = toU32LE(getCompDefAccOffset(c.name));

    try {
      await uploadCircuit(
        provider,
        c.name,
        program.programId,
        new Uint8Array(raw),
        true
      );
      console.log(`[ok] uploaded ${c.name}`);
    } catch (err) {
      const msg = String(err);
      if (
        msg.includes("already") ||
        msg.includes("exists") ||
        msg.includes("AccountAlreadyInitialized")
      ) {
        console.log(`[skip] upload ${c.name}: already present`);
      } else {
        throw err;
      }
    }

    try {
      const tx = await buildFinalizeCompDefTx(provider, compDefOffset, program.programId);
      const sig = await provider.sendAndConfirm(tx, []);
      console.log(`[ok] finalized ${c.name}: ${sig}`);
    } catch (err) {
      const msg = String(err);
      const logs = Array.isArray(err?.transactionLogs) ? err.transactionLogs.join("\n") : "";
      if (
        msg.includes("already") ||
        msg.includes("completed") ||
        msg.includes("AccountAlreadyInitialized")
      ) {
        console.log(`[skip] finalize ${c.name}: already completed`);
      } else if (
        msg.includes("AccountOwnedByWrongProgram") ||
        logs.includes("AccountOwnedByWrongProgram")
      ) {
        console.log(`[skip] finalize ${c.name}: off-chain circuit does not require on-chain raw account finalization`);
      } else {
        throw err;
      }
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
