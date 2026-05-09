/**
 * Blockchain Data Indexer
 *
 * Fetches auction and bid data from Solana blockchain
 * Makes data persist across devices and browsers
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { connection } from './solanaConnection';

/**
 * Fetch all transactions for a wallet address
 * Filters for auction-related transactions
 */
export async function fetchUserAuctions(walletPublicKey) {
  if (!walletPublicKey) {
    return { auctions: [], bids: [] };
  }

  try {
    console.log('Fetching blockchain data for wallet:', walletPublicKey.toString());

    const signatures = await connection.getSignaturesForAddress(walletPublicKey, {
      limit: 100,
    });

    console.log(`Found ${signatures.length} transactions`);

    const auctions = [];
    const bids = [];

    for (const sig of signatures) {
      try {
        const tx = await connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta) continue;

        const balanceDelta = tx.meta.postBalances[0] - tx.meta.preBalances[0];

        const isAuctionCreation =
          tx.transaction.message.accountKeys.length > 0 &&
          balanceDelta < 0 &&
          Math.abs(balanceDelta) < 0.01 * LAMPORTS_PER_SOL;

        const isBidSubmission = balanceDelta < -0.01 * LAMPORTS_PER_SOL;

        if (isAuctionCreation) {
          auctions.push({
            signature: sig.signature,
            timestamp: sig.blockTime * 1000,
            slot: sig.slot,
          });
        }

        if (isBidSubmission) {
          const amount = Math.abs(balanceDelta) / LAMPORTS_PER_SOL;
          bids.push({
            signature: sig.signature,
            timestamp: sig.blockTime * 1000,
            amount,
            slot: sig.slot,
          });
        }
      } catch (err) {
        console.warn('Error parsing transaction:', err.message);
      }
    }

    console.log(`Found ${auctions.length} potential auctions, ${bids.length} potential bids`);

    return { auctions, bids };
  } catch (error) {
    console.error('Error fetching blockchain data:', error);
    return { auctions: [], bids: [] };
  }
}

/**
 * Merge blockchain data with localStorage data
 * Adds on-chain signatures to existing auctions
 */
export function mergeBlockchainData(localAuctions, blockchainData) {
  const { auctions: chainAuctions, bids: chainBids } = blockchainData;

  const mergedAuctions = localAuctions.map((auction) => {
    if (auction.onChainSignature) {
      return auction;
    }

    const match = chainAuctions.find((chainAuction) => {
      const timeDiff = Math.abs(chainAuction.timestamp - auction.createdAt);
      return timeDiff < 60000;
    });

    if (match) {
      return {
        ...auction,
        onChainSignature: match.signature,
        blockchainVerified: true,
      };
    }

    return auction;
  });

  return mergedAuctions.map((auction) => {
    const updatedBids = auction.bids.map((bid) => {
      if (bid.signature) {
        return bid;
      }

      const match = chainBids.find((chainBid) => {
        const timeDiff = Math.abs(chainBid.timestamp - bid.timestamp);
        return timeDiff < 60000 && Math.abs(chainBid.amount - bid.amount) < 0.001;
      });

      if (match) {
        return {
          ...bid,
          signature: match.signature,
          blockchainVerified: true,
        };
      }

      return bid;
    });

    return {
      ...auction,
      bids: updatedBids,
    };
  });
}

/**
 * Verify an auction exists on-chain
 */
export async function verifyAuctionOnChain(signature) {
  try {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    return !!tx;
  } catch (error) {
    console.error('Error verifying transaction:', error);
    return false;
  }
}

/**
 * Get transaction details for display
 */
export async function getTransactionDetails(signature) {
  try {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return null;
    }

    return {
      signature,
      blockTime: tx.blockTime,
      slot: tx.slot,
      fee: tx.meta.fee / LAMPORTS_PER_SOL,
      success: tx.meta.err === null,
    };
  } catch (error) {
    console.error('Error getting transaction details:', error);
    return null;
  }
}

export default {
  fetchUserAuctions,
  mergeBlockchainData,
  verifyAuctionOnChain,
  getTransactionDetails,
};
