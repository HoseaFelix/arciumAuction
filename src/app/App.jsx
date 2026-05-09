'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import WalletConnect from '@/components/WalletConnect';
import AuctionCreator from '@/components/AuctionCreator';
import AuctionList from '@/components/AuctionList';
import { AUCTION_PROGRAM_ID, fetchAllAuctionsOnChain } from '@/utils/programInstructions';
import { fetchAuctionMetadata, fetchAuctionResolutions } from '@/utils/auctionApi';

function formatCompactNumber(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export default function App() {
  const { publicKey, connected } = useWallet();
  const [auctions, setAuctions] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isLoadingBlockchainData, setIsLoadingBlockchainData] = useState(false);
  const storageKey = `arcium_auctions:${AUCTION_PROGRAM_ID.toBase58()}`;

  const mergeAuctionSources = (localAuctions, chainAuctions) => {
    const localByKey = new Map(
      localAuctions.map((auction) => [auction.auctionPDA || auction.id, auction])
    );

    return chainAuctions.map((chainAuction) => {
      const localAuction = localByKey.get(chainAuction.auctionPDA || chainAuction.id);
      if (!localAuction) return chainAuction;

      return {
        ...chainAuction,
        ...localAuction,
        id: chainAuction.id,
        auctionPDA: chainAuction.auctionPDA,
        creator: chainAuction.creator,
        itemName: localAuction.itemName || chainAuction.itemName,
        minimumBid: chainAuction.minimumBid,
        endTime: chainAuction.endTime,
        auctionType: chainAuction.auctionType,
        status: chainAuction.status,
        bidCount: Math.max(chainAuction.bidCount ?? 0, localAuction.bidCount ?? 0, localAuction.bids?.length ?? 0),
        chainBidCount: Math.max(chainAuction.chainBidCount ?? chainAuction.bidCount ?? 0, localAuction.bids?.length ?? 0),
        submittedBidCount: localAuction.submittedBidCount ?? localAuction.bids?.length ?? 0,
        bids: localAuction.bids || chainAuction.bids,
        mpcReady: chainAuction.mpcReady,
        stateNonce: chainAuction.stateNonce,
        blockchainVerified: true,
      };
    });
  };

  const applySharedMetadata = (auctionList, metadataByAuction) =>
    auctionList.map((auction) => {
      const metadata = metadataByAuction[auction.auctionPDA || auction.id];
      if (!metadata) return auction;

      return {
        ...auction,
        description: metadata.description || auction.description,
        imageUrl: metadata.imageUrl || auction.imageUrl,
        createdAt: metadata.createdAt || auction.createdAt,
        bids: metadata.bids || auction.bids || [],
        submittedBidCount: metadata.bids?.length ?? auction.submittedBidCount ?? 0,
        bidCount: Math.max(auction.bidCount ?? 0, metadata.bids?.length ?? 0),
        chainBidCount: Math.max(auction.chainBidCount ?? auction.bidCount ?? 0, metadata.bids?.length ?? 0),
        winner: metadata.resolution?.winner || auction.winner,
        winningBid:
          typeof metadata.resolution?.paymentAmountSol === 'number'
            ? metadata.resolution.paymentAmountSol
            : auction.winningBid,
        resolutionSignature: metadata.resolution?.signature || auction.resolutionSignature,
        resolutionSource: metadata.resolution?.source || auction.resolutionSource,
        status:
          metadata.resolution && auction.status !== 'finalized'
            ? 'finalized'
            : auction.status,
      };
    });

  const applyResolutions = (auctionList, resolutionsByAuction) =>
    auctionList.map((auction) => {
      if (auction.resolutionSource === 'local-store') {
        return auction;
      }
      const resolution = resolutionsByAuction[auction.auctionPDA || auction.id];
      if (!resolution) return auction;

      return {
        ...auction,
        winner: resolution.winner,
        winningBid: resolution.paymentAmountSol,
        resolutionSignature: resolution.signature,
        resolutionSource: resolution.source || 'on-chain',
      };
    });

  const loadAuctionData = useCallback(async () => {
    setIsLoadingBlockchainData(true);
    try {
      const [chainAuctions, metadataByAuction] = await Promise.all([
        fetchAllAuctionsOnChain(),
        fetchAuctionMetadata(),
      ]);

      const savedAuctions = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      const localAuctions = savedAuctions ? JSON.parse(savedAuctions) : [];
      const mergedAuctions = mergeAuctionSources(localAuctions, chainAuctions);
      const withMetadata = applySharedMetadata(mergedAuctions, metadataByAuction);
      const finalizedAuctionPdas = withMetadata
        .filter((auction) => auction.status === 'finalized')
        .map((auction) => auction.auctionPDA)
        .filter(Boolean);
      const resolutionsByAuction = await fetchAuctionResolutions(finalizedAuctionPdas);
      const fullyHydratedAuctions = applyResolutions(withMetadata, resolutionsByAuction);

      setAuctions(fullyHydratedAuctions);

      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(fullyHydratedAuctions));
      }
    } catch (error) {
      console.error('Error loading auction data:', error);
    } finally {
      setIsLoadingBlockchainData(false);
    }
  }, [storageKey]);

  useEffect(() => {
    loadAuctionData();
  }, [loadAuctionData]);

  useEffect(() => {
    if (connected && publicKey) {
      loadAuctionData();
    }
  }, [connected, publicKey, loadAuctionData]);

  const handleCreateAuction = (newAuction) => {
    const updatedAuctions = [newAuction, ...auctions];
    setAuctions(updatedAuctions);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(updatedAuctions));
    }
    setShowCreateForm(false);
  };

  const handleUpdateAuction = (auctionId, updates) => {
    const updatedAuctions = auctions.map((auction) =>
      auction.id === auctionId ? { ...auction, ...updates } : auction
    );
    setAuctions(updatedAuctions);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(updatedAuctions));
    }
  };

  const handleDeleteAuction = (auctionId) => {
    const updatedAuctions = auctions.filter((auction) => auction.id !== auctionId);
    setAuctions(updatedAuctions);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(updatedAuctions));
    }
  };

  const metrics = useMemo(() => {
    const totalBids = auctions.reduce(
      (acc, auction) => acc + (typeof auction.bidCount === 'number' ? auction.bidCount : auction.bids?.length || 0),
      0
    );
    const activeAuctions = auctions.filter(
      (auction) => auction.status !== 'finalized' && Date.now() < auction.endTime
    ).length;
    const finalizedAuctions = auctions.filter((auction) => auction.status === 'finalized').length;

    return {
      totalAuctions: auctions.length,
      totalBids,
      activeAuctions,
      finalizedAuctions,
    };
  }, [auctions]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-5 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="eyebrow mb-2">
              <span className="eyebrow-dot"></span>
              Arcium Auction Console
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Sealed-bid auctions on Solana devnet</h1>
              <span className="status-pill status-active">Live environment</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/guide" target="_blank" rel="noreferrer noopener" className="btn-secondary">
              Project guide
            </a>
            <WalletConnect />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="surface subtle-grid p-6 sm:p-8">
            <div className="eyebrow mb-4">
              <span className="eyebrow-dot"></span>
              Operations overview
            </div>
            <div className="max-w-3xl">
              <h2 className="section-title mb-4">
                Manage encrypted auctions without losing sight of what is actually verified on-chain.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
                Create auctions, accept encrypted bids, and trigger winner computation from one work surface.
                The app keeps local metadata readable while pulling chain state and resolution events back into the list.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => setShowCreateForm(true)}>
                Create auction
              </button>
              <a href="/guide" target="_blank" rel="noreferrer noopener" className="btn-secondary">
                Open project guide
              </a>
              <button className="btn-secondary" onClick={loadAuctionData} disabled={isLoadingBlockchainData}>
                {isLoadingBlockchainData ? 'Refreshing...' : 'Refresh chain data'}
              </button>
            </div>
          </div>

          <div className="surface p-6">
            <div className="eyebrow mb-4">
              <span className="eyebrow-dot"></span>
              Current context
            </div>
            <div className="space-y-4 text-sm">
              <div className="surface-subtle p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Program</p>
                <p className="break-all font-mono text-[var(--text-primary)]">{AUCTION_PROGRAM_ID.toBase58()}</p>
              </div>
              <div className="surface-subtle p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Wallet</p>
                <p className="font-mono text-[var(--text-primary)]">
                  {connected && publicKey
                    ? `${publicKey.toBase58().slice(0, 8)}...${publicKey.toBase58().slice(-8)}`
                    : 'Not connected'}
                </p>
              </div>
              <div className="info-banner">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Devnet workflow</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    Auction cards merge chain state with app-stored bid records, so bid counts and resolution state remain visible alongside on-chain activity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="metric-panel">
            <p className="text-sm font-medium text-[var(--text-secondary)]">Total auctions</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{formatCompactNumber(metrics.totalAuctions)}</p>
          </div>
          <div className="metric-panel">
            <p className="text-sm font-medium text-[var(--text-secondary)]">Encrypted bids</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{formatCompactNumber(metrics.totalBids)}</p>
          </div>
          <div className="metric-panel">
            <p className="text-sm font-medium text-[var(--text-secondary)]">Active auctions</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{formatCompactNumber(metrics.activeAuctions)}</p>
          </div>
          <div className="metric-panel">
            <p className="text-sm font-medium text-[var(--text-secondary)]">Finalized</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{formatCompactNumber(metrics.finalizedAuctions)}</p>
          </div>
        </section>

        <section className="surface p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="eyebrow mb-3">
                <span className="eyebrow-dot"></span>
                How it behaves
              </div>
              <h3 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">Operational notes</h3>
              <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                Bids are encrypted client-side before submission. Winner computation is triggered through Arcium and the result is read back from Solana events. This interface is designed to keep the auction workflow and system state easy to inspect.
              </p>
            </div>
            <div className="grid min-w-[260px] gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <div className="surface-subtle p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Bids</p>
                <p className="text-sm text-[var(--text-primary)]">Encrypted before chain submission</p>
              </div>
              <div className="surface-subtle p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Resolution</p>
                <p className="text-sm text-[var(--text-primary)]">Read from on-chain events</p>
              </div>
              <div className="surface-subtle p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Storage</p>
                <p className="text-sm text-[var(--text-primary)]">Metadata and bid book stored through app API</p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow mb-2">
                <span className="eyebrow-dot"></span>
                Auction inventory
              </div>
              <h3 className="text-2xl font-semibold text-[var(--text-primary)]">Auction workspace</h3>
            </div>
          </div>

          <AuctionList
            auctions={auctions}
            onUpdateAuction={handleUpdateAuction}
            onDeleteAuction={handleDeleteAuction}
          />
        </section>
      </main>

      {showCreateForm && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(2,6,23,0.76)] backdrop-blur-sm animate-fade-in"
          onClick={() => setShowCreateForm(false)}
        >
          <div className="mx-auto flex min-h-full max-w-5xl items-start justify-center px-3 py-4 sm:px-6 sm:py-10">
            <div className="w-full animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <AuctionCreator
                onCreateAuction={handleCreateAuction}
                onCancel={() => setShowCreateForm(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
