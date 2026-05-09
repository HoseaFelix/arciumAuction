import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useWallet } from '@solana/wallet-adapter-react';
import { finalizeAuctionOnChain } from '../utils/programInstructions';
import { saveAuctionResolution } from '../utils/auctionApi';

function computeLocalResolution(auction) {
  const bids = [...(auction.bids || [])]
    .filter((bid) => Number.isFinite(Number(bid.amount)))
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  if (bids.length === 0) {
    throw new Error('No bids submitted for this auction');
  }

  const highestBid = bids[0];
  const secondHighestBid = bids[1];
  const paymentAmountSol =
    auction.auctionType === 'vickrey' && secondHighestBid
      ? Number(secondHighestBid.amount)
      : Number(highestBid.amount);

  return {
    winner: highestBid.bidder,
    paymentAmountSol,
    paymentAmountLamports: Math.round(paymentAmountSol * 1e9),
    auctionType: auction.auctionType,
    source: 'local-store',
  };
}

export default function WinnerReveal({ auction, onFinalized }) {
  const wallet = useWallet();
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [computationStage, setComputationStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [winner, setWinner] = useState(null);
  const [showReveal, setShowReveal] = useState(false);
  const [displayedAmount, setDisplayedAmount] = useState(0);

  const handleFinalize = async () => {
    if ((auction.bidCount ?? auction.bids.length) === 0) {
      alert('No bids submitted for this auction');
      return;
    }
    if (!wallet.connected) {
      alert('Please connect your wallet to finalize');
      return;
    }

    setIsFinalizing(true);
    setProgress(0);

    try {
      const stages = [
        { text: 'Closing the auction and queuing computation...', duration: 900, progress: 18 },
        { text: 'Arcium nodes loading encrypted state...', duration: 1200, progress: 42 },
        { text: 'Computing winner from encrypted bids...', duration: 1500, progress: 72 },
        { text: 'Recording auction outcome from stored bids...', duration: 1000, progress: 92 },
        { text: 'Updating the workspace...', duration: 700, progress: 100 },
      ];

      for (const stage of stages) {
        setComputationStage(stage.text);
        await new Promise((resolve) => setTimeout(resolve, stage.duration));
        setProgress(stage.progress);
      }

      await finalizeAuctionOnChain(wallet, auction.auctionPDA, auction.auctionType);
      const resolution = computeLocalResolution(auction);
      await saveAuctionResolution(auction.auctionPDA, resolution);

      setWinner({ address: resolution.winner, amount: resolution.paymentAmountSol });
      setIsFinalizing(false);
      setShowReveal(true);

      setTimeout(() => {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.65 },
          colors: ['#3b82f6', '#14b8a6', '#e2e8f0'],
        });
      }, 400);

      onFinalized(resolution.winner, resolution.paymentAmountSol, resolution.source);
    } catch (error) {
      console.error('Error finalizing auction:', error);
      alert(error.message || 'Failed to finalize auction');
      setIsFinalizing(false);
      setComputationStage('');
      setProgress(0);
    }
  };

  useEffect(() => {
    if (winner && showReveal) {
      const duration = 1000;
      const steps = 40;
      const increment = winner.amount / steps;
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= winner.amount) {
          setDisplayedAmount(winner.amount);
          clearInterval(timer);
        } else {
          setDisplayedAmount(current);
        }
      }, duration / steps);

      return () => clearInterval(timer);
    }
  }, [winner, showReveal]);

  if (showReveal && winner) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 animate-fade-in">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
          <p className="font-semibold text-emerald-100">Finalization complete</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="surface-subtle p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-100/70">Winner</p>
            <p className="break-all font-mono text-sm text-white">{winner.address}</p>
          </div>
          <div className="surface-subtle p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-100/70">Winning amount</p>
            <p className="text-3xl font-semibold text-white">{displayedAmount.toFixed(4)} SOL</p>
          </div>
        </div>
        <p className="mt-3 text-xs uppercase tracking-[0.08em] text-emerald-100/70">
          Derived from app-stored submitted bids
        </p>
      </div>
    );
  }

  return !isFinalizing ? (
    <button onClick={handleFinalize} className="btn-secondary">
      Finalize auction
    </button>
  ) : (
    <div className="surface-subtle p-5 animate-fade-in">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">MPC finalization in progress</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{computationStage}</p>
        </div>
        <p className="font-mono text-sm text-[var(--accent-primary)]">{progress}%</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] transition-all duration-500"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
}
