import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { encryptBid } from '../utils/arciumEncryption';
import { validateBid } from '../utils/helpers';
import { submitBidOnChain, getWalletBalance } from '../utils/programInstructions';
import { saveAuctionBid } from '../utils/auctionApi';

export default function BidSubmission({ auction, onBidSubmitted, onCancel }) {
  const { connected, publicKey } = useWallet();
  const wallet = useWallet();
  const [bidAmount, setBidAmount] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptionStage, setEncryptionStage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!connected) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      const amount = parseFloat(bidAmount);
      validateBid(amount, auction.minimumBid);
      if (!auction.auctionPDA) {
        throw new Error('Auction not initialized on-chain yet.');
      }
      if (!auction.mpcReady) {
        throw new Error('Auction privacy state is still initializing. Refresh in a few seconds, then submit the bid.');
      }

      const balance = await getWalletBalance(publicKey);
      if (balance < amount) {
        throw new Error(`Insufficient balance. You have ${balance.toFixed(4)} SOL. Need ${amount} SOL + gas fees. Get devnet SOL from https://faucet.solana.com`);
      }

      setIsEncrypting(true);

      setEncryptionStage('Generating client keys...');
      await new Promise((resolve) => setTimeout(resolve, 400));

      setEncryptionStage('Encrypting bid payload...');
      const encrypted = await encryptBid(
        BigInt(Math.floor(amount * 1e9)),
        publicKey.toBase58()
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      setEncryptionStage('Submitting encrypted bid to devnet...');
      const result = await submitBidOnChain(wallet, auction.auctionPDA, encrypted, amount);

      const encryptedBid = {
        id: crypto.randomUUID(),
        bidder: publicKey.toString(),
        amount,
        encryptedAmount: encrypted.encryptedAmount,
        encryptedBidderLo: encrypted.encryptedBidderLo,
        encryptedBidderHi: encrypted.encryptedBidderHi,
        bidderPubkey: encrypted.bidderPubkey,
        x25519PublicKey: encrypted.x25519PublicKey,
        nonce: encrypted.nonce,
        timestamp: Date.now(),
        txSignature: result.signature,
        submittedAmount: result.submittedAmount,
      };

      const storedBid = await saveAuctionBid(auction.auctionPDA, encryptedBid);
      setNotice('Bid transaction succeeded on-chain. Bid activity is updated immediately from the app store.');
      onBidSubmitted(storedBid);
      setBidAmount('');
      setIsEncrypting(false);
      setEncryptionStage('');
    } catch (err) {
      setError(err.message);
      setIsEncrypting(false);
      setEncryptionStage('');
    }
  };

  if (!connected) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        Please connect your wallet to submit a bid.
      </div>
    );
  }

  return (
    <div className="surface-subtle p-4 sm:p-5">
      <div className="mb-4">
        <p className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Submit an encrypted bid</p>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          The amount is encrypted client-side before the transaction is sent. The public interface only tracks that a bid was submitted.
        </p>
        {!auction.mpcReady && (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            This auction is still waiting for its initial Arcium state callback. Refresh shortly before bidding.
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="field-label">Bid amount</label>
          <div className="flex items-stretch gap-3">
            <input
              type="number"
              value={bidAmount}
              onChange={(e) => {
                setBidAmount(e.target.value);
                setError('');
                setNotice('');
              }}
              placeholder={`Minimum ${auction.minimumBid} SOL`}
              step="0.01"
              min={auction.minimumBid}
              disabled={isEncrypting || !auction.mpcReady}
              className={`input-field ${error ? 'border-red-500' : ''}`}
            />
            <span className="inline-flex min-w-[68px] items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[rgba(15,23,43,0.72)] px-4 text-sm font-medium text-[var(--text-secondary)]">
              SOL
            </span>
          </div>
          {error && <p className="field-help text-red-400">{error}</p>}
          {notice && <p className="field-help text-amber-300">{notice}</p>}
        </div>

        {isEncrypting && (
          <div className="surface-subtle p-4">
            <div className="mb-2 flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-[var(--text-primary)]">{encryptionStage}</p>
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent-primary)]">Processing</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)]"></div>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isEncrypting}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isEncrypting || !bidAmount || !auction.mpcReady}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isEncrypting ? 'Submitting...' : 'Submit bid'}
          </button>
        </div>
      </form>
    </div>
  );
}
