import React, { useEffect, useMemo, useState } from 'react';
import CountdownTimer from './CountdownTimer';
import BidSubmission from './BidSubmission';
import WinnerReveal from './WinnerReveal';

function formatStatus(isFinalized, isEnded) {
  if (isFinalized) return { label: 'Finalized', className: 'status-pill status-finalized' };
  if (isEnded) return { label: 'Ended', className: 'status-pill status-ended' };
  return { label: 'Open', className: 'status-pill status-active' };
}

export default function AuctionCard({ auction, onUpdateAuction, onDeleteAuction }) {
  const [showBidForm, setShowBidForm] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isEndedLive, setIsEndedLive] = useState(Date.now() >= auction.endTime);
  const isEnded = isEndedLive || Date.now() >= auction.endTime;
  const isFinalized = auction.status === 'finalized';
  const totalBids = Math.max(
    typeof auction.bidCount === 'number' ? auction.bidCount : 0,
    Array.isArray(auction.bids) ? auction.bids.length : 0
  );
  const imageUrl = (auction.imageUrl || '').trim();
  const status = formatStatus(isFinalized, isEnded);

  useEffect(() => {
    if (Date.now() >= auction.endTime) {
      setIsEndedLive(true);
      return undefined;
    }
    const delay = Math.max(0, auction.endTime - Date.now() + 50);
    const timer = setTimeout(() => setIsEndedLive(true), delay);
    return () => clearTimeout(timer);
  }, [auction.endTime]);

  const handleBidSubmitted = (encryptedBid) => {
    const updatedBids = [...auction.bids, encryptedBid];
    onUpdateAuction(auction.id, {
      bids: updatedBids,
      bidCount: updatedBids.length,
      chainBidCount: updatedBids.length,
    });
    setShowBidForm(false);
  };

  const handleFinalized = (winner, winningBid, resolutionSource = 'local-store') => {
    onUpdateAuction(auction.id, {
      status: 'finalized',
      winner,
      winningBid,
      resolutionSource,
    });
  };

  const handleDelete = () => {
    if (!onDeleteAuction) return;
    const confirmed = window.confirm('Delete this auction from your local list? This does not affect on-chain data.');
    if (!confirmed) return;
    onDeleteAuction(auction.id);
  };

  const metaRows = useMemo(() => ([
    {
      label: 'Minimum bid',
      value: `${auction.minimumBid} SOL`,
    },
    {
      label: 'Confirmed bids',
      value: String(totalBids),
    },
    {
      label: 'Creator',
      value: `${auction.creator.slice(0, 6)}...${auction.creator.slice(-4)}`,
    },
    {
      label: 'Auction type',
      value: auction.auctionType === 'vickrey' ? 'Vickrey' : 'First-price',
    },
    {
      label: 'MPC state',
      value: auction.mpcReady ? 'Ready' : 'Initializing',
    },
  ]), [auction, totalBids]);

  return (
    <article className="surface-hover overflow-hidden">
      <div className="p-5 sm:p-6">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[rgba(10,16,32,0.92)]">
                  {imageUrl && !imageError ? (
                    <img
                      src={imageUrl}
                      alt={auction.itemName}
                      className="h-full w-full object-cover"
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <svg className="h-6 w-6 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-10h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={status.className}>{status.label}</span>
                {auction.blockchainVerified && <span className="status-pill status-active">On-chain</span>}
                  </div>
                  <h3 className="mb-2 text-2xl font-semibold leading-tight text-[var(--text-primary)]">{auction.itemName}</h3>
                  <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                    {auction.description || 'No description provided.'}
                  </p>
                </div>
              </div>
            </div>
            <button type="button" onClick={handleDelete} className="btn-danger self-start">
              Remove
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metaRows.map((row) => (
              <div key={row.label} className="surface-subtle p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{row.label}</p>
                <p className="text-sm font-medium leading-6 text-[var(--text-primary)]">{row.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="surface-subtle p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Close time</p>
              <p className="text-sm leading-6 text-[var(--text-primary)]">{new Date(auction.endTime).toLocaleString()}</p>
            </div>
            <div className="surface-subtle p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">State</p>
              <div className="min-h-[24px] text-sm font-medium text-[var(--text-primary)]">
                {!isEnded && <CountdownTimer endTime={auction.endTime} onEnd={() => setIsEndedLive(true)} />}
                {isEnded && !isFinalized && 'Awaiting finalization'}
                {isFinalized && 'Resolution recorded'}
              </div>
            </div>
          </div>

          {isFinalized && auction.winner ? (
            <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                <p className="font-semibold text-emerald-200">Winner recorded</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-100/70">Winner</p>
                  <p className="font-mono text-sm text-white">{auction.winner.slice(0, 8)}...{auction.winner.slice(-8)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-100/70">Winning amount</p>
                  <p className="text-lg font-semibold text-white">{auction.winningBid.toFixed(4)} SOL</p>
                </div>
              </div>
              {auction.resolutionSource && (
                <p className="mt-3 text-xs uppercase tracking-[0.08em] text-emerald-100/70">
                  Source: {auction.resolutionSource === 'local-store' ? 'App-stored bids' : auction.resolutionSource}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                {totalBids > 0
                  ? 'Encrypted bids have been submitted for this auction. The public interface only tracks submission count until finalization.'
                  : 'No bids submitted yet. Once bidders start participating, the auction will show encrypted bid activity here.'}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-4 border-t border-white/5 pt-5">
            {!isEnded && !showBidForm && (
              <button
                onClick={() => setShowBidForm(true)}
                className="btn-primary w-full sm:w-auto"
                disabled={!auction.mpcReady}
                title={!auction.mpcReady ? 'Wait for the initial Arcium state callback to finish.' : undefined}
              >
                {auction.mpcReady ? 'Submit encrypted bid' : 'Initializing privacy state...'}
              </button>
            )}

            {showBidForm && (
              <div className="mt-4">
                <BidSubmission
                  auction={auction}
                  onBidSubmitted={handleBidSubmitted}
                  onCancel={() => setShowBidForm(false)}
                />
              </div>
            )}

            {isEnded && !isFinalized && (
              <div className="mt-4">
                <WinnerReveal auction={auction} onFinalized={handleFinalized} />
              </div>
            )}
          </div>
      </div>
    </article>
  );
}
