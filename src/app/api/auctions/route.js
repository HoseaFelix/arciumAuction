import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';

const { BorshCoder, EventParser } = anchor;

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || 'ByASCyH6YjXWa9KS1qdGVGxH5vgQFAC4Aauh4Z89ut9t'
);

const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const DATA_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'arcium-auction-data')
  : path.resolve(process.cwd(), 'data');
const METADATA_FILE = path.join(DATA_DIR, 'auction-metadata.json');
const IDL_PATH = path.resolve(process.cwd(), 'src', 'idl', 'auction.json');

let idlCache = null;
let coderCache = null;

async function ensureMetadataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(METADATA_FILE);
  } catch {
    await fs.writeFile(METADATA_FILE, '{}', 'utf8');
  }
}

async function readMetadataStore() {
  await ensureMetadataFile();
  const raw = await fs.readFile(METADATA_FILE, 'utf8');
  return JSON.parse(raw || '{}');
}

async function writeMetadataStore(store) {
  await ensureMetadataFile();
  await fs.writeFile(METADATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeAuctionEntry(entry = {}) {
  return {
    auctionPDA: entry.auctionPDA || '',
    creator: entry.creator || '',
    itemName: entry.itemName || '',
    description: entry.description || '',
    imageUrl: entry.imageUrl || '',
    createdAt: entry.createdAt || Date.now(),
    updatedAt: entry.updatedAt || Date.now(),
    bids: Array.isArray(entry.bids) ? entry.bids : [],
    resolution: entry.resolution || null,
  };
}

function buildStoredResolutionPayload(resolution = {}) {
  const paymentAmountSol = Number(resolution.paymentAmountSol ?? 0);
  return {
    winner: resolution.winner || '',
    paymentAmountSol,
    paymentAmountLamports:
      resolution.paymentAmountLamports ?? Math.round(paymentAmountSol * 1e9),
    auctionType: resolution.auctionType || 'firstPrice',
    signature: resolution.signature || null,
    source: resolution.source || 'local-store',
    updatedAt: Date.now(),
  };
}

async function getCoder() {
  if (coderCache) return coderCache;
  if (!idlCache) {
    const raw = await fs.readFile(IDL_PATH, 'utf8');
    idlCache = JSON.parse(raw);
  }
  coderCache = new BorshCoder(idlCache);
  return coderCache;
}

async function findResolvedAuctionEvent(auctionPda) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const auctionAddress = new PublicKey(auctionPda);
  const coder = await getCoder();
  const parser = new EventParser(PROGRAM_ID, coder);

  const signatures = await connection.getSignaturesForAddress(auctionAddress, { limit: 20 });

  for (const sig of signatures) {
    const tx = await connection.getTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    const logs = tx?.meta?.logMessages ?? [];
    for (const event of parser.parseLogs(logs)) {
      if (event.name !== 'AuctionResolvedEvent') continue;

      const winnerBytes = event.data.winner;
      const winner = new PublicKey(Uint8Array.from(winnerBytes)).toBase58();
      const rawPaymentAmount =
        event.data.paymentAmount ??
        event.data.payment_amount ??
        event.data.field_1;

      if (!rawPaymentAmount) {
        console.warn('AuctionResolvedEvent missing payment amount field', event.data);
        continue;
      }

      const paymentAmountLamports = Number(rawPaymentAmount.toString());

      return {
        signature: sig.signature,
        slot: tx?.slot ?? sig.slot,
        winner,
        paymentAmountLamports,
        paymentAmountSol: paymentAmountLamports / 1e9,
        auctionType: event.data.auctionType ?? event.data.auction_type ?? null,
      };
    }
  }

  return null;
}

const resolutionCache = new Map();

export async function GET(request) {
  const { pathname } = request.nextUrl;
  
  // Handle /api/auctions/metadata
  if (pathname.endsWith('/metadata')) {
    try {
      const metadata = await readMetadataStore();
      return NextResponse.json({ success: true, metadata });
    } catch (error) {
      console.error('Error reading auction metadata:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  const bidsMatch = pathname.match(/\/bids\/(.+)$/);
  if (bidsMatch) {
    try {
      const auctionPda = bidsMatch[1];
      const store = await readMetadataStore();
      const entry = normalizeAuctionEntry(store[auctionPda]);
      return NextResponse.json({ success: true, bids: entry.bids });
    } catch (error) {
      console.error('Error reading auction bids:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }
  
  // Handle /api/auctions/resolution/:auctionPda
  const resolutionMatch = pathname.match(/\/resolution\/(.+)$/);
  if (resolutionMatch) {
    try {
      const auctionPda = resolutionMatch[1];
      if (!auctionPda) {
        return NextResponse.json({
          success: false,
          error: 'Missing auction PDA',
        }, { status: 400 });
      }
      const store = await readMetadataStore();
      const storedResolution = normalizeAuctionEntry(store[auctionPda]).resolution;

      if (storedResolution) {
        return NextResponse.json({ success: true, resolution: storedResolution });
      }

      const cachedResolution = resolutionCache.get(auctionPda);
      if (cachedResolution) {
        return NextResponse.json({ success: true, resolution: cachedResolution });
      }

      const resolution = await findResolvedAuctionEvent(auctionPda);

      if (resolution) {
        resolutionCache.set(auctionPda, resolution);
        return NextResponse.json({ success: true, resolution });
      }

      return NextResponse.json({
        success: false,
        error: 'Resolved auction event not found yet',
      }, { status: 404 });
    } catch (error) {
      console.error('Error reading auction resolution:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }
  
  return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
}

export async function POST(request) {
  const { pathname } = request.nextUrl;
  
  if (pathname.endsWith('/metadata')) {
    try {
      const body = await request.json();
      const { auctionPDA, creator, itemName, description = '', imageUrl = '', createdAt = Date.now() } = body;

      if (!auctionPDA || !creator || !itemName) {
        return NextResponse.json({
          success: false,
          error: 'auctionPDA, creator, and itemName are required',
        }, { status: 400 });
      }

      const store = await readMetadataStore();
      const existing = normalizeAuctionEntry(store[auctionPDA]);
      store[auctionPDA] = {
        ...existing,
        auctionPDA,
        creator,
        itemName,
        description,
        imageUrl,
        createdAt,
        updatedAt: Date.now(),
      };

      await writeMetadataStore(store);

      return NextResponse.json({ success: true, metadata: store[auctionPDA] });
    } catch (error) {
      console.error('Error saving auction metadata:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  if (pathname.endsWith('/bids')) {
    try {
      const body = await request.json();
      const { auctionPDA, bid } = body;

      if (!auctionPDA || !bid) {
        return NextResponse.json({
          success: false,
          error: 'auctionPDA and bid are required',
        }, { status: 400 });
      }

      const store = await readMetadataStore();
      const existing = normalizeAuctionEntry(store[auctionPDA]);
      const bids = existing.bids.filter((entry) => entry.txSignature !== bid.txSignature);
      const storedBid = {
        ...bid,
        id: bid.id || crypto.randomUUID(),
        amount: Number(bid.amount ?? bid.submittedAmount ?? 0),
        submittedAmount: Number(bid.submittedAmount ?? bid.amount ?? 0),
        timestamp: bid.timestamp || Date.now(),
      };

      store[auctionPDA] = {
        ...existing,
        auctionPDA,
        bids: [...bids, storedBid].sort((a, b) => a.timestamp - b.timestamp),
        updatedAt: Date.now(),
      };

      await writeMetadataStore(store);

      return NextResponse.json({ success: true, bid: storedBid, bids: store[auctionPDA].bids });
    } catch (error) {
      console.error('Error saving auction bid:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  if (pathname.endsWith('/resolution')) {
    try {
      const body = await request.json();
      const { auctionPDA, resolution } = body;

      if (!auctionPDA || !resolution?.winner) {
        return NextResponse.json({
          success: false,
          error: 'auctionPDA and resolution.winner are required',
        }, { status: 400 });
      }

      const store = await readMetadataStore();
      const existing = normalizeAuctionEntry(store[auctionPDA]);
      const storedResolution = buildStoredResolutionPayload(resolution);

      store[auctionPDA] = {
        ...existing,
        auctionPDA,
        resolution: storedResolution,
        updatedAt: Date.now(),
      };

      resolutionCache.set(auctionPDA, storedResolution);

      await writeMetadataStore(store);

      return NextResponse.json({ success: true, resolution: storedResolution });
    } catch (error) {
      console.error('Error saving auction resolution:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }
  
  return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
}
