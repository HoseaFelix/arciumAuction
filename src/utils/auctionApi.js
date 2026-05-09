const ENCRYPTION_API_BASE_URL =
  process.env.NEXT_PUBLIC_ENCRYPTION_API_BASE_URL || '/api/encryption';

const AUCTIONS_API_BASE_URL =
  process.env.NEXT_PUBLIC_AUCTIONS_API_BASE_URL ||
  ENCRYPTION_API_BASE_URL.replace(/\/encryption\/?$/, '/auctions');

export async function fetchAuctionMetadata() {
  const response = await fetch(`${AUCTIONS_API_BASE_URL}/metadata`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch auction metadata');
  }

  return data.metadata || {};
}

export async function saveAuctionMetadata(metadata) {
  const response = await fetch(`${AUCTIONS_API_BASE_URL}/metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to save auction metadata');
  }

  return data.metadata;
}

export async function saveAuctionBid(auctionPDA, bid) {
  const response = await fetch(`${AUCTIONS_API_BASE_URL}/bids`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ auctionPDA, bid }),
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to save auction bid');
  }

  return data.bid;
}

export async function fetchAuctionBids(auctionPda) {
  const response = await fetch(`${AUCTIONS_API_BASE_URL}/bids/${auctionPda}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch auction bids');
  }

  return data.bids || [];
}

export async function fetchAuctionResolution(auctionPda) {
  const response = await fetch(`${AUCTIONS_API_BASE_URL}/resolution/${auctionPda}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch auction resolution');
  }

  return data.resolution;
}

export async function saveAuctionResolution(auctionPDA, resolution) {
  const response = await fetch(`${AUCTIONS_API_BASE_URL}/resolution`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ auctionPDA, resolution }),
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to save auction resolution');
  }

  return data.resolution;
}

export async function fetchAuctionResolutions(auctionPdas) {
  const uniqueAuctionPdas = [...new Set(auctionPdas.filter(Boolean))];
  const results = [];

  for (const auctionPda of uniqueAuctionPdas) {
    try {
      const resolution = await fetchAuctionResolution(auctionPda);
      results.push([auctionPda, resolution]);
    } catch (_error) {
      results.push([auctionPda, null]);
    }
  }

  return Object.fromEntries(results.filter(([, resolution]) => resolution));
}

export default {
  fetchAuctionMetadata,
  saveAuctionMetadata,
  saveAuctionBid,
  fetchAuctionBids,
  fetchAuctionResolution,
  saveAuctionResolution,
  fetchAuctionResolutions,
};
