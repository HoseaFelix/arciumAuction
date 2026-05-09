/**
 * Arcium MPC Encryption Utilities - API Client Version
 *
 * This module calls the backend API which uses the official @arcium-hq/client SDK
 * for production-grade x25519 + Rescue cipher encryption.
 *
 * Backend handles encryption (Node.js - SDK compatible)
 * Frontend handles Solana transactions (Browser)
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_ENCRYPTION_API_BASE_URL || '/api/encryption';

/**
 * Get MXE Public Key from backend
 */
export async function getMXEPublicKey() {
  const response = await fetch(`${API_BASE_URL}/mxe-pubkey`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to get MXE public key');
  }

  return new Uint8Array(data.publicKey);
}

/**
 * Encrypt bid amount using backend API with real Arcium SDK
 *
 * @param {bigint|number} bidAmount - Bid amount in lamports
 * @returns {Promise<Object>} Encrypted bid data
 */
export async function encryptBid(bidAmount, bidderPubkey) {
  const amount = typeof bidAmount === 'bigint' ? Number(bidAmount) : bidAmount;

  const response = await fetch(`${API_BASE_URL}/encrypt-bid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bidAmount: amount, bidderPubkey }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Encryption failed');
  }

  return data.encrypted;
}

/**
 * Decrypt bid (for testing/verification only)
 * In production, MPC nodes handle decryption
 */
export async function decryptBid(ciphertext, nonce, publicKey) {
  const response = await fetch(`${API_BASE_URL}/decrypt-bid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ciphertext, nonce, publicKey }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Decryption failed');
  }

  return BigInt(data.decrypted.amount);
}

/**
 * Validate encrypted bid data structure
 */
export function validateEncryptedBid(encryptedBid) {
  if (!encryptedBid.encryptedAmount || encryptedBid.encryptedAmount.length !== 32) {
    throw new Error('Invalid encrypted amount: must be 32 bytes');
  }

  if (!encryptedBid.encryptedBidderLo || encryptedBid.encryptedBidderLo.length !== 32) {
    throw new Error('Invalid encrypted bidder (lo): must be 32 bytes');
  }

  if (!encryptedBid.encryptedBidderHi || encryptedBid.encryptedBidderHi.length !== 32) {
    throw new Error('Invalid encrypted bidder (hi): must be 32 bytes');
  }

  if (!encryptedBid.bidderPubkey || encryptedBid.bidderPubkey.length !== 32) {
    throw new Error('Invalid bidder pubkey: must be 32 bytes');
  }

  if (!encryptedBid.nonce || encryptedBid.nonce.length !== 16) {
    throw new Error('Invalid nonce: must be 16 bytes');
  }

  return true;
}

/**
 * Generate computation ID for tracking MPC execution
 */
export function generateComputationId() {
  return `mpc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default {
  encryptBid,
  decryptBid,
  getMXEPublicKey,
  validateEncryptedBid,
  generateComputationId,
};
