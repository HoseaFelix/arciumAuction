import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import BN from "bn.js";
import {
  getArciumEnv,
  getArciumProgram,
  getArciumProgramId,
  getClockAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getFeePoolAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
} from "@arcium-hq/client";
import { Auction } from "../target/types/auction.js";

type ArciumAccounts = {
  arciumProgram: anchor.web3.PublicKey;
  mxeAccount: anchor.web3.PublicKey;
  mempoolAccount: anchor.web3.PublicKey;
  executingPool: anchor.web3.PublicKey;
  clusterAccount: anchor.web3.PublicKey;
  compDefAccount: anchor.web3.PublicKey;
  computationAccount: anchor.web3.PublicKey;
  poolAccount: anchor.web3.PublicKey;
  clockAccount: anchor.web3.PublicKey;
  systemProgram: anchor.web3.PublicKey;
};

function u32FromLe(bytes: Uint8Array): number {
  if (bytes.length !== 4) {
    throw new Error(`expected 4 bytes for u32, got ${bytes.length}`);
  }
  return (
    bytes[0] |
    (bytes[1] << 8) |
    (bytes[2] << 16) |
    (bytes[3] << 24)
  ) >>> 0;
}

function buildArciumAccounts(
  programId: anchor.web3.PublicKey,
  clusterOffset: number,
  computationOffset: BN,
  circuitName: string
): ArciumAccounts {
  const compDefOffset = u32FromLe(getCompDefAccOffset(circuitName));

  return {
    arciumProgram: getArciumProgramId(),
    mxeAccount: getMXEAccAddress(programId),
    mempoolAccount: getMempoolAccAddress(clusterOffset),
    executingPool: getExecutingPoolAccAddress(clusterOffset),
    clusterAccount: getClusterAccAddress(clusterOffset),
    compDefAccount: getCompDefAccAddress(programId, compDefOffset),
    computationAccount: getComputationAccAddress(clusterOffset, computationOffset),
    poolAccount: getFeePoolAccAddress(),
    clockAccount: getClockAccAddress(),
    systemProgram: anchor.web3.SystemProgram.programId,
  };
}

describe("auction", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Auction as Program<Auction>;
  const authority = provider.wallet;

  let clusterOffset = 456;

  let prerequisitesReady = false;
  let skipReason = "";

  before(async () => {
    try {
      const arciumProgram = getArciumProgram(provider);
      const mxeAccount = getMXEAccAddress(program.programId);
      const mxe = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
      const cluster = (mxe as { cluster?: number | null }).cluster;
      if (typeof cluster === "number") {
        clusterOffset = cluster;
      }
    } catch (_err) {
      try {
        clusterOffset = getArciumEnv().arciumClusterOffset;
      } catch (_err2) {
        // keep default 456
      }
    }

    const probeOffset = new BN(1);
    const probe = buildArciumAccounts(
      program.programId,
      clusterOffset,
      probeOffset,
      "init_auction_state"
    );

    const probeKeys = [
      probe.mxeAccount,
      probe.clusterAccount,
      probe.mempoolAccount,
      probe.executingPool,
      probe.poolAccount,
      probe.clockAccount,
      probe.compDefAccount,
    ];

    const infos = await provider.connection.getMultipleAccountsInfo(probeKeys);
    const missing = probeKeys
      .map((k, i) => ({ key: k.toBase58(), info: infos[i] }))
      .filter((x) => x.info === null)
      .map((x) => x.key);

    if (missing.length === 0) {
      prerequisitesReady = true;
      return;
    }

    prerequisitesReady = false;
    skipReason =
      "Missing required Arcium accounts on current cluster: " +
      missing.join(", ");
  });

  it("exposes expected instructions in IDL", () => {
    const names = program.idl.instructions.map((ix: { name: string }) => ix.name);
    assert.include(names, "createAuction");
    assert.include(names, "placeBid");
    assert.include(names, "determineWinnerFirstPrice");
    assert.include(names, "determineWinnerVickrey");
    assert.include(names, "closeAuction");
  });

  it("creates and closes a first-price auction", async function () {
    if (!prerequisitesReady) {
      this.skip();
    }

    const now = Math.floor(Date.now() / 1000);
    const computationOffset = new BN(Date.now());

    const [auctionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("auction"),
        authority.publicKey.toBuffer(),
        computationOffset.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const createAccounts = buildArciumAccounts(
      program.programId,
      clusterOffset,
      computationOffset,
      "init_auction_state"
    );

    await program.methods
      .createAuction(
        computationOffset,
        { firstPrice: {} },
        new BN(1_000_000),
        new BN(now - 5),
        "Integration Test Item"
      )
      .accountsStrict({
        authority: authority.publicKey,
        auction: auctionPda,
        signPdaAccount: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("ArciumSignerAccount")],
          program.programId
        )[0],
        mxeAccount: createAccounts.mxeAccount,
        mempoolAccount: createAccounts.mempoolAccount,
        executingPool: createAccounts.executingPool,
        computationAccount: createAccounts.computationAccount,
        compDefAccount: createAccounts.compDefAccount,
        clusterAccount: createAccounts.clusterAccount,
        poolAccount: createAccounts.poolAccount,
        clockAccount: createAccounts.clockAccount,
        systemProgram: createAccounts.systemProgram,
        arciumProgram: createAccounts.arciumProgram,
      })
      .rpc();

    const created = await program.account.auction.fetch(auctionPda);
    assert.equal(created.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(created.itemName, "Integration Test Item");
    assert.equal(created.minBid.toString(), "1000000");

    await program.methods
      .closeAuction()
      .accountsStrict({
        authority: authority.publicKey,
        auction: auctionPda,
      })
      .rpc();

    const closed = await program.account.auction.fetch(auctionPda);
    assert.isTrue("closed" in closed.status);
  });

  after(function () {
    if (!prerequisitesReady && skipReason.length > 0) {
      // Keep this visible in test logs without failing CI/dev flow.
      // eslint-disable-next-line no-console
      console.log(`[auction test] Skipped integration path: ${skipReason}`);
    }
  });
});
