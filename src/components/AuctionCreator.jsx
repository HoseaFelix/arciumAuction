import React, { useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { createAuctionOnChain, waitForAuctionInitialization } from '../utils/programInstructions';
import { saveAuctionMetadata } from '../utils/auctionApi';

export default function AuctionCreator({ onCreateAuction, onCancel }) {
  const { connected, publicKey } = useWallet();
  const wallet = useWallet();
  const [formData, setFormData] = useState({
    itemName: '',
    description: '',
    imageUrl: '',
    minimumBid: '',
    endTime: '',
  });
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState('');

  const previewImage = uploadedImageDataUrl || formData.imageUrl.trim();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, imageUrl: 'Please choose a valid image file' }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImageDataUrl(String(reader.result || ''));
      setErrors((prev) => ({ ...prev, imageUrl: '' }));
    };
    reader.onerror = () => {
      setErrors((prev) => ({ ...prev, imageUrl: 'Failed to read image file' }));
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.itemName.trim()) {
      newErrors.itemName = 'Item name is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (previewImage) {
      if (!previewImage.startsWith('data:image/')) {
        try {
          const parsed = new URL(previewImage);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            newErrors.imageUrl = 'Image URL must start with http:// or https://';
          }
        } catch (_err) {
          newErrors.imageUrl = 'Enter a valid image URL';
        }
      }
    }

    const minBid = parseFloat(formData.minimumBid);
    if (!formData.minimumBid || Number.isNaN(minBid) || minBid <= 0) {
      newErrors.minimumBid = 'Minimum bid must be greater than 0';
    }

    if (!formData.endTime) {
      newErrors.endTime = 'End time is required';
    } else {
      const endDate = new Date(formData.endTime);
      if (endDate <= new Date()) {
        newErrors.endTime = 'End time must be in the future';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!connected) {
      setErrors({ submit: 'Please connect your wallet first' });
      return;
    }

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const auctionId = crypto.randomUUID();
      const newAuction = {
        id: auctionId,
        creator: publicKey.toString(),
        itemName: formData.itemName,
        description: formData.description,
        imageUrl: previewImage,
        minimumBid: parseFloat(formData.minimumBid),
        endTime: new Date(formData.endTime).getTime(),
        bids: [],
        auctionType: 'firstPrice',
        status: 'active',
        createdAt: Date.now(),
      };

      setTxStatus('Creating auction on Solana devnet...');
      const result = await createAuctionOnChain(wallet, newAuction);

      newAuction.onChainSignature = result.signature;
      newAuction.auctionPDA = result.auctionPDA;
      newAuction.computationOffset = result.computationOffset;

      await saveAuctionMetadata({
        auctionPDA: newAuction.auctionPDA,
        creator: newAuction.creator,
        itemName: newAuction.itemName,
        description: newAuction.description,
        imageUrl: newAuction.imageUrl,
        createdAt: newAuction.createdAt,
      });

      setTxStatus('Waiting for Arcium privacy state initialization...');
      const initializedAuction = await waitForAuctionInitialization(newAuction.auctionPDA, {
        maxAttempts: 25,
        delayMs: 2000,
      });
      newAuction.mpcReady = initializedAuction.mpcReady;
      newAuction.stateNonce = initializedAuction.stateNonce;
      newAuction.bidCount = initializedAuction.bidCount;
      newAuction.chainBidCount = initializedAuction.chainBidCount;

      setTxStatus('Auction confirmed on-chain.');
      await new Promise((resolve) => setTimeout(resolve, 700));

      onCreateAuction(newAuction);
      setFormData({ itemName: '', description: '', imageUrl: '', minimumBid: '', endTime: '' });
      setUploadedImageDataUrl('');
      setTxStatus('');
    } catch (error) {
      console.error('Error creating auction:', error);
      setErrors({ submit: error.message });
      setTxStatus('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const summary = useMemo(() => ({
    minimumBid: formData.minimumBid ? `${formData.minimumBid} SOL` : 'Set minimum bid',
    closingAt: formData.endTime ? new Date(formData.endTime).toLocaleString() : 'Choose closing time',
  }), [formData.minimumBid, formData.endTime]);

  if (!connected) {
    return (
      <div className="surface mx-auto max-w-2xl p-8 text-center">
        <h3 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">Wallet not connected</h3>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          Connect your wallet to create an auction and queue its initial Arcium computation.
        </p>
      </div>
    );
  }

  return (
    <div className="surface mx-auto max-w-5xl overflow-hidden">
      <div className="grid lg:grid-cols-[1.05fr_1.45fr]">
        <aside className="border-b border-white/5 bg-[rgba(8,15,30,0.88)] p-6 lg:border-b-0 lg:border-r">
          <div className="eyebrow mb-4">
            <span className="eyebrow-dot"></span>
            Auction draft
          </div>
          <h2 className="mb-3 text-2xl font-semibold text-[var(--text-primary)]">Create a new listing</h2>
          <p className="mb-6 text-sm leading-6 text-[var(--text-secondary)]">
            Set the public listing details here. The private bidding flow happens after the auction is created and Arcium state is initialized.
          </p>

          <div className="surface-subtle overflow-hidden">
            <div className="aspect-[4/3] border-b border-white/5 bg-[rgba(15,23,43,0.75)]">
              {previewImage ? (
                <img src={previewImage} alt="Auction preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">
                  Listing preview appears here once you add an image.
                </div>
              )}
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Title</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                  {formData.itemName.trim() || 'Untitled auction'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Minimum bid</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{summary.minimumBid}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Closes</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{summary.closingAt}</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="eyebrow mb-3">
                <span className="eyebrow-dot"></span>
                Listing details
              </div>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                Clean public metadata makes the auction list easier to scan once the chain state is merged back in.
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Close
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="field-label">Item name</label>
                <input
                  type="text"
                  name="itemName"
                  value={formData.itemName}
                  onChange={handleChange}
                  placeholder="Rare collectible, limited artwork, domain name"
                  className={`input-field ${errors.itemName ? 'border-red-500' : ''}`}
                />
                {errors.itemName && <p className="field-help text-red-400">{errors.itemName}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="field-label">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Add the context bidders need before they commit to a sealed bid."
                  className={`input-field resize-none ${errors.description ? 'border-red-500' : ''}`}
                />
                {errors.description && <p className="field-help text-red-400">{errors.description}</p>}
              </div>

              <div>
                <label className="field-label">Upload image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className={`input-field ${errors.imageUrl ? 'border-red-500' : ''}`}
                />
              </div>

              <div>
                <label className="field-label">Image URL</label>
                <input
                  type="url"
                  name="imageUrl"
                  value={formData.imageUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/item-image.jpg"
                  className={`input-field ${errors.imageUrl ? 'border-red-500' : ''}`}
                />
              </div>

              <div>
                <label className="field-label">Minimum bid</label>
                <div className="flex items-stretch gap-3">
                  <input
                    type="number"
                    name="minimumBid"
                    value={formData.minimumBid}
                    onChange={handleChange}
                    placeholder="0.50"
                    step="0.01"
                    min="0"
                    className={`input-field ${errors.minimumBid ? 'border-red-500' : ''}`}
                  />
                  <span className="inline-flex min-w-[68px] items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[rgba(15,23,43,0.72)] px-4 text-sm font-medium text-[var(--text-secondary)]">
                    SOL
                  </span>
                </div>
                {errors.minimumBid && <p className="field-help text-red-400">{errors.minimumBid}</p>}
              </div>

              <div>
                <label className="field-label">End time</label>
                <input
                  type="datetime-local"
                  name="endTime"
                  value={formData.endTime}
                  onChange={handleChange}
                  className={`input-field ${errors.endTime ? 'border-red-500' : ''}`}
                />
                {errors.endTime && <p className="field-help text-red-400">{errors.endTime}</p>}
              </div>
            </div>

            {txStatus && (
              <div className="info-banner">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-[var(--text-primary)]">{txStatus}</p>
              </div>
            )}

            {errors.submit && (
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {errors.submit}
              </div>
            )}

            <div className="divider pt-6">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={onCancel} className="btn-secondary min-w-[120px]">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="btn-primary min-w-[180px] disabled:cursor-not-allowed disabled:opacity-60">
                  {isSubmitting ? 'Creating...' : 'Create auction'}
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
