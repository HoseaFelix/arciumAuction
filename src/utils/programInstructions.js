/**
 * Solana Program Instructions - Real MPC (Devnet)
 */

import { PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { connection, solToLamports } from './solanaConnection';
import idl from '../idl/auction.json';

export const AUCTION_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || 'ByASCyH6YjXWa9KS1qdGVGxH5vgQFAC4Aauh4Z89ut9t'
);

const IDL_FOR_PROGRAM = {
  ...idl,
  address: AUCTION_PROGRAM_ID.toBase58(),
};

const IDL_NO_ACCOUNTS = {
  ...IDL_FOR_PROGRAM,
  accounts: [],
};

const ENCRYPTION_API_BASE_URL =
  process.env.NEXT_PUBLIC_ENCRYPTION_API_BASE_URL || '/api/encryption';

function buildApiUrl(pathname) {
  if (/^https?:\/\//i.test(ENCRYPTION_API_BASE_URL)) {
    return new URL(pathname, ENCRYPTION_API_BASE_URL.endsWith('/') ? ENCRYPTION_API_BASE_URL : `${ENCRYPTION_API_BASE_URL}/`);
  }

  if (typeof window !== 'undefined') {
    return new URL(pathname, window.location.origin);
  }

  return new URL(pathname, 'http://localhost:3000');
}

function getProvider(wallet) {
  return new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
}

function getReadonlyProvider() {
  const wallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };

  return new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
}

function u128FromLeBytes(bytes) {
  let out = 0n;
  for (let i = 0; i < bytes.length; i++) {
    out += BigInt(bytes[i]) << (8n * BigInt(i));
  }
  return new BN(out.toString());
}

function u64ToLeBuffer(value) {
  const bn = BN.isBN(value) ? value : new BN(value.toString());
  return bn.toArrayLike(Buffer, 'le', 8);
}

async function getArciumAccounts(computationOffset, circuitName) {
  const basePath = ENCRYPTION_API_BASE_URL.endsWith('/')
    ? ENCRYPTION_API_BASE_URL.slice(0, -1)
    : ENCRYPTION_API_BASE_URL;
  const url = buildApiUrl(`${basePath}/arcium-accounts`);
  url.searchParams.set('computationOffset', computationOffset.toString());
  url.searchParams.set('circuitName', circuitName);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to derive Arcium accounts');
  }

  const { accounts } = data;
  return {
    arciumProgram: new PublicKey(accounts.arciumProgram),
    mxeAccount: new PublicKey(accounts.mxeAccount),
    mempoolAccount: new PublicKey(accounts.mempoolAccount),
    executingPool: new PublicKey(accounts.executingPool),
    clusterAccount: new PublicKey(accounts.clusterAccount),
    compDefAccount: new PublicKey(accounts.compDefAccount),
    computationAccount: new PublicKey(accounts.computationAccount),
    poolAccount: new PublicKey(accounts.poolAccount),
    clockAccount: new PublicKey(accounts.clockAccount),
  };
}

function parseAuctionType(auctionType) {
  if (!auctionType) return 'firstPrice';
  if ('firstPrice' in auctionType) return 'firstPrice';
  if ('vickrey' in auctionType) return 'vickrey';
  return 'firstPrice';
}

function parseAuctionStatus(status) {
  if (!status) return 'active';
  if ('open' in status) return 'active';
  if ('closed' in status) return 'closed';
  if ('resolved' in status) return 'finalized';
  return 'active';
}

export function getAuctionPDA(authorityPubkey, computationOffset) {
  if (computationOffset === undefined || computationOffset === null) {
    throw new Error('computationOffset is required to derive auction PDA');
  }
  const authority = new PublicKey(authorityPubkey);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('auction'), authority.toBuffer(), u64ToLeBuffer(computationOffset)],
    AUCTION_PROGRAM_ID
  );
  return pda;
}

export async function fetchAllAuctionsOnChain() {
  try {
    const provider = getReadonlyProvider();
    const program = new Program(IDL_FOR_PROGRAM, provider);
    const auctions = await program.account.auction.all();

    return auctions
      .map(({ publicKey, account }) => {
        const bidCount = Number(account.bidCount ?? 0);
        const endTime = Number(account.endTime.toString()) * 1000;
        const stateNonce = account.stateNonce?.toString?.() ?? account.stateNonce ?? '0';
        const mpcReady = stateNonce !== '0';

        return {
          id: publicKey.toBase58(),
          auctionPDA: publicKey.toBase58(),
          creator: account.authority.toBase58(),
          itemName: account.itemName,
          description: '',
          imageUrl: '',
          minimumBid: Number(account.minBid.toString()) / 1e9,
          endTime,
          bids: Array.from({ length: bidCount }, (_, index) => ({
            id: `${publicKey.toBase58()}-${index}`,
          })),
          bidCount,
          auctionType: parseAuctionType(account.auctionType),
          status: parseAuctionStatus(account.status),
          createdAt: endTime,
          mpcReady,
          stateNonce,
          blockchainVerified: true,
          onChainSignature: null,
        };
      })
      .sort((a, b) => b.endTime - a.endTime);
  } catch (error) {
    console.error('Error fetching all auctions on-chain:', error);
    throw new Error(`Failed to fetch auctions: ${error.message}`);
  }
}

export async function createAuctionOnChain(wallet, auctionData) {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }

  const computationOffset = new BN(Date.now());
  const auctionPDA = getAuctionPDA(wallet.publicKey.toBase58(), computationOffset);

  try {
    const provider = getProvider(wallet);
    const program = new Program(IDL_NO_ACCOUNTS, provider);
    const signPdaAccount = PublicKey.findProgramAddressSync(
      [Buffer.from('ArciumSignerAccount')],
      AUCTION_PROGRAM_ID
    )[0];

    const arcium = await getArciumAccounts(computationOffset, 'init_auction_state');
    const auctionType = auctionData.auctionType === 'vickrey' ? { vickrey: {} } : { firstPrice: {} };

    const signature = await program.methods
      .createAuction(
        computationOffset,
        auctionType,
        new BN(solToLamports(auctionData.minimumBid)),
        new BN(Math.floor(auctionData.endTime / 1000)),
        auctionData.itemName
      )
      .accountsStrict({
        authority: wallet.publicKey,
        auction: auctionPDA,
        signPdaAccount,
        mxeAccount: arcium.mxeAccount,
        mempoolAccount: arcium.mempoolAccount,
        executingPool: arcium.executingPool,
        computationAccount: arcium.computationAccount,
        compDefAccount: arcium.compDefAccount,
        clusterAccount: arcium.clusterAccount,
        poolAccount: arcium.poolAccount,
        clockAccount: arcium.clockAccount,
        systemProgram: SystemProgram.programId,
        arciumProgram: arcium.arciumProgram,
      })
      .rpc();

    return {
      signature,
      auctionPDA: auctionPDA.toBase58(),
      computationOffset: computationOffset.toString(),
    };
  } catch (error) {
    console.error('Error creating auction on-chain:', error);
    if (String(error.message || error).includes('already been processed')) {
      const existingAuction = await connection.getAccountInfo(auctionPDA);
      if (existingAuction) {
        return {
          signature: error.signature || 'already-processed',
          auctionPDA: auctionPDA.toBase58(),
          computationOffset: computationOffset.toString(),
        };
      }
    }
    throw new Error(`Failed to create auction: ${error.message}`);
  }
}

export async function fetchAuctionOnChain(auctionPda) {
  try {
    const provider = getReadonlyProvider();
    const program = new Program(IDL_FOR_PROGRAM, provider);
    const publicKey = new PublicKey(auctionPda);
    const account = await program.account.auction.fetch(publicKey);
    const bidCount = Number(account.bidCount ?? 0);
    const endTime = Number(account.endTime.toString()) * 1000;
    const stateNonce = account.stateNonce?.toString?.() ?? account.stateNonce ?? '0';
    const mpcReady = stateNonce !== '0';

    return {
      id: publicKey.toBase58(),
      auctionPDA: publicKey.toBase58(),
      creator: account.authority.toBase58(),
      itemName: account.itemName,
      description: '',
      imageUrl: '',
      minimumBid: Number(account.minBid.toString()) / 1e9,
      endTime,
      bids: Array.from({ length: bidCount }, (_, index) => ({
        id: `${publicKey.toBase58()}-${index}`,
      })),
      bidCount,
      chainBidCount: bidCount,
      auctionType: parseAuctionType(account.auctionType),
      status: parseAuctionStatus(account.status),
      createdAt: endTime,
      mpcReady,
      stateNonce,
      blockchainVerified: true,
      onChainSignature: null,
    };
  } catch (error) {
    console.error('Error fetching auction on-chain:', error);
    throw new Error(`Failed to fetch auction ${auctionPda}: ${error.message}`);
  }
}

async function waitForAuctionPredicate(auctionPda, predicate, options = {}) {
  const { maxAttempts = 20, delayMs = 2000 } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const auction = await fetchAuctionOnChain(auctionPda);
    if (predicate(auction)) {
      return auction;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Timed out waiting for auction state to update on-chain');
}

export async function waitForAuctionInitialization(auctionPda, options = {}) {
  return waitForAuctionPredicate(auctionPda, (auction) => auction.mpcReady, options);
}

export async function waitForAuctionBidCount(auctionPda, minBidCount, options = {}) {
  return waitForAuctionPredicate(
    auctionPda,
    (auction) => (auction.chainBidCount ?? auction.bidCount ?? 0) >= minBidCount,
    options
  );
}

export async function submitBidOnChain(wallet, auctionPda, encryptedBid, bidAmountSOL) {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }

  try {
    const provider = getProvider(wallet);
    const program = new Program(IDL_NO_ACCOUNTS, provider);

    const computationOffset = new BN(Date.now());
    const auction = new PublicKey(auctionPda);
    const signPdaAccount = PublicKey.findProgramAddressSync(
      [Buffer.from('ArciumSignerAccount')],
      AUCTION_PROGRAM_ID
    )[0];
    const arcium = await getArciumAccounts(computationOffset, 'place_bid_v2');

    const signature = await program.methods
      .placeBid(
        computationOffset,
        Uint8Array.from(encryptedBid.encryptedBidderLo),
        Uint8Array.from(encryptedBid.encryptedBidderHi),
        Uint8Array.from(encryptedBid.encryptedAmount),
        Uint8Array.from(encryptedBid.x25519PublicKey),
        u128FromLeBytes(encryptedBid.nonce)
      )
      .accountsStrict({
        bidder: wallet.publicKey,
        auction,
        signPdaAccount,
        mxeAccount: arcium.mxeAccount,
        mempoolAccount: arcium.mempoolAccount,
        executingPool: arcium.executingPool,
        computationAccount: arcium.computationAccount,
        compDefAccount: arcium.compDefAccount,
        clusterAccount: arcium.clusterAccount,
        poolAccount: arcium.poolAccount,
        clockAccount: arcium.clockAccount,
        systemProgram: SystemProgram.programId,
        arciumProgram: arcium.arciumProgram,
      })
      .rpc();

    return { signature, submittedAmount: bidAmountSOL };
  } catch (error) {
    console.error('Error submitting bid on-chain:', error);
    if (error.message.includes('insufficient')) {
      throw new Error('Insufficient SOL balance. Get devnet SOL: https://faucet.solana.com');
    }
    throw new Error(`Failed to submit bid: ${error.message}`);
  }
}

export async function finalizeAuctionOnChain(wallet, auctionPda, auctionType = 'firstPrice') {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }

  try {
    const provider = getProvider(wallet);
    const program = new Program(IDL_NO_ACCOUNTS, provider);
    const computationOffset = new BN(Date.now());
    const auction = new PublicKey(auctionPda);
    const signPdaAccount = PublicKey.findProgramAddressSync(
      [Buffer.from('ArciumSignerAccount')],
      AUCTION_PROGRAM_ID
    )[0];

    try {
      await program.methods
        .closeAuction()
        .accountsStrict({
          authority: wallet.publicKey,
          auction,
        })
        .rpc();
    } catch (closeError) {
      if (!String(closeError.message || closeError).includes('already been processed')) {
        throw closeError;
      }
    }

    const circuit = auctionType === 'vickrey' ? 'determine_winner_vickrey' : 'determine_winner_first_price';
    const arcium = await getArciumAccounts(computationOffset, circuit);

    const method = auctionType === 'vickrey'
      ? program.methods.determineWinnerVickrey(computationOffset)
      : program.methods.determineWinnerFirstPrice(computationOffset);

    let signature;
    try {
      signature = await method
        .accountsStrict({
          authority: wallet.publicKey,
          auction,
          signPdaAccount,
          mxeAccount: arcium.mxeAccount,
          mempoolAccount: arcium.mempoolAccount,
          executingPool: arcium.executingPool,
          computationAccount: arcium.computationAccount,
          compDefAccount: arcium.compDefAccount,
          clusterAccount: arcium.clusterAccount,
          poolAccount: arcium.poolAccount,
          clockAccount: arcium.clockAccount,
          systemProgram: SystemProgram.programId,
          arciumProgram: arcium.arciumProgram,
        })
        .rpc();
    } catch (computeError) {
      if (!String(computeError.message || computeError).includes('already been processed')) {
        throw computeError;
      }
      signature = computeError.signature || 'already-processed';
    }

    return { signature, status: 'computing' };
  } catch (error) {
    console.error('Error finalizing auction:', error);
    throw new Error(`Failed to finalize: ${error.message}`);
  }
}

export async function getWalletBalance(publicKey) {
  try {
    const balance = await connection.getBalance(publicKey);
    return balance / 1e9;
  } catch (error) {
    console.error('Error getting balance:', error);
    return 0;
  }
}

export async function requestDevnetAirdrop(publicKey, amount = 1) {
  try {
    const signature = await connection.requestAirdrop(
      publicKey,
      amount * 1e9
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    return signature;
  } catch (error) {
    console.error('Airdrop failed:', error);
    throw new Error('Airdrop failed. Use: https://faucet.solana.com');
  }
}

export default {
  createAuctionOnChain,
  submitBidOnChain,
  finalizeAuctionOnChain,
  getWalletBalance,
  requestDevnetAirdrop,
  getAuctionPDA,
  fetchAllAuctionsOnChain,
  fetchAuctionOnChain,
  waitForAuctionInitialization,
  waitForAuctionBidCount,
  AUCTION_PROGRAM_ID,
};
