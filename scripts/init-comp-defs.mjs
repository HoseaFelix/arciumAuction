import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Connection, Keypair } from "@solana/web3.js";
import {
  getArciumProgram,
  getArciumProgramId,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  getMXEAccAddress,
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
  const arciumProgram = getArciumProgram(provider);
  const arciumProgramId = getArciumProgramId();

  const mxeAccount = getMXEAccAddress(program.programId);
  const mxe = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
  const lutOffset = new BN(mxe.lutOffsetSlot.toString());
  const addressLookupTable = getLookupTableAddress(program.programId, lutOffset);

  const jobs = [
    { circuit: "init_auction_state", method: "initAuctionStateCompDef" },
    { circuit: "place_bid_v2", method: "initPlaceBidCompDef" },
    { circuit: "determine_winner_first_price", method: "initDetermineWinnerFirstPriceCompDef" },
    { circuit: "determine_winner_vickrey", method: "initDetermineWinnerVickreyCompDef" },
  ];

  for (const job of jobs) {
    const compDefOffset = toU32LE(getCompDefAccOffset(job.circuit));
    const compDefAccount = getCompDefAccAddress(program.programId, compDefOffset);

    try {
      const sig = await program.methods[job.method]()
        .accountsStrict({
          payer: provider.wallet.publicKey,
          mxeAccount,
          compDefAccount,
          addressLookupTable,
          lutProgram: anchor.web3.AddressLookupTableProgram.programId,
          arciumProgram: arciumProgramId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`[ok] ${job.circuit}: ${sig}`);
    } catch (err) {
      const msg = String(err);
      if (
        msg.includes("already in use") ||
        msg.includes("AccountAlreadyInitialized") ||
        msg.includes("custom program error: 0x0")
      ) {
        console.log(`[skip] ${job.circuit}: already initialized`);
        continue;
      }

      console.error(`[fail] ${job.circuit}`);
      throw err;
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
