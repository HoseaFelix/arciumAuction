import React, { useMemo, useState } from 'react';
import AuctionCard from './AuctionCard';

export default function AuctionList({ auctions, onUpdateAuction, onDeleteAuction }) {
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => ({
    all: auctions.length,
    active: auctions.filter((auction) => Date.now() < auction.endTime && auction.status !== 'finalized').length,
    ended: auctions.filter((auction) => Date.now() >= auction.endTime && auction.status !== 'finalized').length,
    finalized: auctions.filter((auction) => auction.status === 'finalized').length,
  }), [auctions]);

  const filteredAuctions = useMemo(() => auctions.filter((auction) => {
    const isEnded = Date.now() >= auction.endTime;
    const isFinalized = auction.status === 'finalized';

    if (filter === 'active') return !isEnded && !isFinalized;
    if (filter === 'ended') return isEnded && !isFinalized;
    if (filter === 'finalized') return isFinalized;
    return true;
  }), [auctions, filter]);

  if (auctions.length === 0) {
    return (
      <div className="empty-state">
        <h3 className="mb-2 text-2xl font-semibold text-[var(--text-primary)]">No auctions yet</h3>
        <p className="mx-auto max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
          Create your first listing to start testing the sealed-bid flow. New auctions appear here once local metadata and on-chain state are merged.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="segmented-control w-full overflow-x-auto lg:w-auto">
          {[
            ['all', `All (${counts.all})`],
            ['active', `Active (${counts.active})`],
            ['ended', `Ended (${counts.ended})`],
            ['finalized', `Finalized (${counts.finalized})`],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`segment-button ${filter === value ? 'is-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Showing <span className="font-semibold text-[var(--text-primary)]">{filteredAuctions.length}</span> auction{filteredAuctions.length === 1 ? '' : 's'}
        </p>
      </div>

      {filteredAuctions.length === 0 ? (
        <div className="empty-state">
          <p className="text-sm text-[var(--text-secondary)]">No auctions match the current filter.</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {filteredAuctions.map((auction) => (
            <AuctionCard
              key={auction.id}
              auction={auction}
              onUpdateAuction={onUpdateAuction}
              onDeleteAuction={onDeleteAuction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
