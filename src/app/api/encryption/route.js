import { NextResponse } from 'next/server';
import {
  RescueCipher,
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
  getMXEPublicKey,
  x25519,
} from '@arcium-hq/client';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const { BN, AnchorProvider } = anchor;

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || 'ByASCyH6YjXWa9KS1qdGVGxH5vgQFAC4Aauh4Z89ut9t'
);
const CLUSTER_OFFSET = Number(process.env.CLUSTER_OFFSET || 456);
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

function buildArciumProvider() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const keypair = Keypair.generate();
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
  return new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
}

function getCompDefOffset(circuitName) {
  if (!circuitName) {
    throw new Error('Missing circuit name');
  }

  const bytes = getCompDefAccOffset(circuitName);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 4) {
    throw new Error(`Unable to derive comp-def offset for circuit: ${circuitName}`);
  }

  return (
    bytes[0] |
    (bytes[1] << 8) |
    (bytes[2] << 16) |
    (bytes[3] << 24)
  ) >>> 0;
}

export async function GET(request) {
  try {
    const { pathname, searchParams } = new URL(request.url);

    if (pathname.endsWith('/mxe-pubkey')) {
      const provider = buildArciumProvider();
      const mxePDA = getMXEAccAddress(PROGRAM_ID);
      const mxePublicKey = await getMXEPublicKey(provider, PROGRAM_ID);

      if (!mxePublicKey) {
        throw new Error('MXE utility pubkeys not initialized yet');
      }

      return NextResponse.json({
        success: true,
        publicKey: Array.from(mxePublicKey),
        programId: PROGRAM_ID.toString(),
        clusterOffset: CLUSTER_OFFSET,
        mxePDA: mxePDA.toString(),
      });
    }

    const computationOffsetRaw = searchParams.get('computationOffset');
    const circuitName = String(searchParams.get('circuitName') || '');

    if (!computationOffsetRaw) {
      return NextResponse.json({
        success: false,
        error: 'Missing computationOffset query param',
      }, { status: 400 });
    }

    let compDefOffset;
    try {
      compDefOffset = getCompDefOffset(circuitName);
    } catch (_error) {
      return NextResponse.json({
        success: false,
        error: `Unknown circuit name: ${circuitName}`,
      }, { status: 400 });
    }

    const computationOffsetString = String(computationOffsetRaw);
    if (!/^\d+$/.test(computationOffsetString)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid computationOffset',
      }, { status: 400 });
    }
    const computationOffsetBn = new BN(computationOffsetString);

    const accounts = {
      arciumProgram: getArciumProgramId().toString(),
      mxeAccount: getMXEAccAddress(PROGRAM_ID).toString(),
      mempoolAccount: getMempoolAccAddress(CLUSTER_OFFSET).toString(),
      executingPool: getExecutingPoolAccAddress(CLUSTER_OFFSET).toString(),
      clusterAccount: getClusterAccAddress(CLUSTER_OFFSET).toString(),
      compDefAccount: getCompDefAccAddress(PROGRAM_ID, compDefOffset).toString(),
      computationAccount: getComputationAccAddress(CLUSTER_OFFSET, computationOffsetBn).toString(),
      poolAccount: getFeePoolAccAddress().toString(),
      clockAccount: getClockAccAddress().toString(),
      clusterOffset: CLUSTER_OFFSET,
      programId: PROGRAM_ID.toString(),
      circuitName,
      compDefOffset,
      computationOffset: computationOffsetString,
    };

    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    console.error('Error getting arcium accounts:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { pathname } = request.nextUrl;

    if (!pathname.endsWith('/encrypt-bid')) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const { bidAmount, bidderPubkey } = await request.json();

    if (!bidAmount || bidAmount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid bid amount' }, { status: 400 });
    }
    if (!bidderPubkey) {
      return NextResponse.json({ success: false, error: 'Missing bidder pubkey' }, { status: 400 });
    }

    const amount = BigInt(Math.floor(bidAmount));
    const provider = buildArciumProvider();
    const mxePDA = getMXEAccAddress(PROGRAM_ID);
    const mxePublicKey = await getMXEPublicKey(provider, PROGRAM_ID);

    if (!mxePublicKey) {
      throw new Error('MXE utility pubkeys not initialized yet');
    }

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    const bidderBytes = new PublicKey(bidderPubkey).toBytes();
    const toU128 = (bytes) => {
      let out = 0n;
      for (let i = 0; i < bytes.length; i += 1) {
        out += BigInt(bytes[i]) << (8n * BigInt(i));
      }
      return out;
    };

    const ciphertext = cipher.encrypt([
      toU128(bidderBytes.slice(0, 16)),
      toU128(bidderBytes.slice(16, 32)),
      amount,
    ], nonce);

    return NextResponse.json({
      success: true,
      encrypted: {
        encryptedBidderLo: ciphertext[0],
        encryptedBidderHi: ciphertext[1],
        encryptedAmount: ciphertext[2],
        bidderPubkey: Array.from(bidderBytes),
        x25519PublicKey: Array.from(publicKey),
        nonce: Array.from(nonce),
        metadata: {
          algorithm: 'x25519-Rescue',
          sdk: '@arcium-hq/client',
          programId: PROGRAM_ID.toString(),
          clusterOffset: CLUSTER_OFFSET,
          mxePDA: mxePDA.toString(),
          timestamp: Date.now(),
        },
      },
    });
  } catch (error) {
    console.error('Encryption error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
