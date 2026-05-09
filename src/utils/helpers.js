/**
 * General Helper Utilities
 * 
 * This module provides common helper functions used throughout the app.
 */

/**
 * Format a timestamp to a human-readable date string
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format SOL amount with proper decimals
 * 
 * @param {number} amount - Amount in SOL
 * @param {number} decimals - Number of decimal places (default: 4)
 * @returns {string} Formatted SOL amount
 */
export function formatSOL(amount, decimals = 4) {
  return amount.toFixed(decimals);
}

/**
 * Validate a bid amount
 * 
 * @param {number} amount - Bid amount to validate
 * @param {number} minimumBid - Minimum required bid
 * @throws {Error} If validation fails
 * @returns {boolean} True if valid
 */
export function validateBid(amount, minimumBid) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Bid amount must be a valid number');
  }

  if (amount <= 0) {
    throw new Error('Bid amount must be greater than 0');
  }

  if (amount < minimumBid) {
    throw new Error(`Bid must be at least ${minimumBid} SOL`);
  }

  return true;
}

/**
 * Calculate time remaining until a future timestamp
 * 
 * @param {number} endTime - Unix timestamp in milliseconds
 * @returns {Object} Time remaining broken down by units
 */
export function getTimeRemaining(endTime) {
  const total = endTime - Date.now();

  if (total <= 0) {
    return {
      total: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return {
    total,
    days,
    hours,
    minutes,
    seconds,
  };
}

/**
 * Truncate a string to a maximum length
 * 
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add if truncated (default: '...')
 * @returns {string} Truncated string
 */
export function truncateString(str, maxLength, suffix = '...') {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Format a Solana address for display
 * 
 * @param {string} address - Full Solana address
 * @param {number} startChars - Characters to show at start (default: 4)
 * @param {number} endChars - Characters to show at end (default: 4)
 * @returns {string} Formatted address
 */
export function formatAddress(address, startChars = 4, endChars = 4) {
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Sleep for a specified duration
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random ID
 * 
 * @returns {string} Random ID
 */
export function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if an auction is active
 * 
 * @param {Object} auction - Auction object
 * @returns {boolean} True if auction is active
 */
export function isAuctionActive(auction) {
  return Date.now() < auction.endTime && auction.status !== 'finalized';
}

/**
 * Check if an auction has ended
 * 
 * @param {Object} auction - Auction object
 * @returns {boolean} True if auction has ended
 */
export function isAuctionEnded(auction) {
  return Date.now() >= auction.endTime;
}

/**
 * Check if an auction is finalized
 * 
 * @param {Object} auction - Auction object
 * @returns {boolean} True if auction is finalized
 */
export function isAuctionFinalized(auction) {
  return auction.status === 'finalized';
}

/**
 * Copy text to clipboard
 * 
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} True if successful
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Format a large number with commas
 * 
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export function formatNumber(num) {
  return num.toLocaleString('en-US');
}

/**
 * Calculate percentage
 * 
 * @param {number} value - Current value
 * @param {number} total - Total value
 * @returns {number} Percentage
 */
export function calculatePercentage(value, total) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Debounce a function
 * 
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export default {
  formatDate,
  formatSOL,
  validateBid,
  getTimeRemaining,
  truncateString,
  formatAddress,
  sleep,
  generateId,
  isAuctionActive,
  isAuctionEnded,
  isAuctionFinalized,
  copyToClipboard,
  formatNumber,
  calculatePercentage,
  debounce,
};