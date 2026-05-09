/**
 * Solana Connection Utilities
 * 
 * This module provides helper functions for connecting to Solana
 * and interacting with the blockchain.
 */

import { Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';

/**
 * Default Solana network endpoint
 */
export const NETWORK = 'devnet';
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || null;

/**
 * Create a Solana connection
 * 
 * @param {string} network - Network to connect to (mainnet-beta, devnet, testnet)
 * @param {string} customRpc - Optional custom RPC endpoint
 * @returns {Connection} Solana connection instance
 */
export function createConnection(network = NETWORK, customRpc = null) {
  const endpoint = customRpc || RPC_URL || clusterApiUrl(network);
  
  return new Connection(endpoint, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });
}

/**
 * Get the default connection
 */
export const connection = createConnection();

/**
 * Arcium MXE Program ID
 * Replace with your deployed Arcium program ID when needed
 */
export const ARCIUM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
export const ARCIUM_CORE_PROGRAM_ID = new PublicKey(
  'Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ'
);

/**
 * Wait for transaction confirmation
 * 
 * @param {Connection} connection - Solana connection
 * @param {string} signature - Transaction signature
 * @param {string} commitment - Confirmation level
 * @returns {Promise<void>}
 */
export async function confirmTransaction(connection, signature, commitment = 'confirmed') {
  const latestBlockhash = await connection.getLatestBlockhash();
  
  await connection.confirmTransaction({
    signature,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }, commitment);
}

/**
 * Get SOL balance for a wallet
 * 
 * @param {Connection} connection - Solana connection
 * @param {PublicKey} publicKey - Wallet public key
 * @returns {Promise<number>} Balance in SOL
 */
export async function getBalance(connection, publicKey) {
  const balance = await connection.getBalance(publicKey);
  return balance / 1e9;
}

/**
 * Airdrop SOL to a wallet (devnet only)
 * 
 * @param {Connection} connection - Solana connection
 * @param {PublicKey} publicKey - Wallet public key
 * @param {number} amount - Amount in SOL
 * @returns {Promise<string>} Transaction signature
 */
export async function requestAirdrop(connection, publicKey, amount = 1) {
  const signature = await connection.requestAirdrop(
    publicKey,
    amount * 1e9
  );
  
  await confirmTransaction(connection, signature);
  return signature;
}

/**
 * Format lamports to SOL
 * 
 * @param {number} lamports - Amount in lamports
 * @returns {string} Formatted SOL amount
 */
export function lamportsToSOL(lamports) {
  return (lamports / 1e9).toFixed(4);
}

/**
 * Format SOL to lamports
 * 
 * @param {number} sol - Amount in SOL
 * @returns {number} Amount in lamports
 */
export function solToLamports(sol) {
  return Math.floor(sol * 1e9);
}

export default {
  createConnection,
  connection,
  ARCIUM_PROGRAM_ID,
  confirmTransaction,
  getBalance,
  requestAirdrop,
  lamportsToSOL,
  solToLamports,
};
