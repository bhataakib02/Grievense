/**
 * Utility formatters for addresses, chains, timestamps, and explorer links.
 */

/**
 * Formats an Ethereum address to a shortened string (e.g. 0x1234...5678).
 * @param {string} address - Full Ethereum address.
 * @param {number} chars - Number of characters to keep on each side (default 4).
 * @returns {string} Shortened address.
 */
export function shortenAddress(address, chars = 4) {
  if (!address || typeof address !== 'string') return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Safely parses any representation of a chain ID (number, bigint, hex string, decimal string)
 * into a standard numeric integer chain ID, or null if invalid.
 * @param {number|bigint|string} chainId
 * @returns {number|null}
 */
export function parseChainId(chainId) {
  if (chainId === null || chainId === undefined || chainId === '') return null;
  if (typeof chainId === 'number') return Number.isFinite(chainId) ? Math.floor(chainId) : null;
  if (typeof chainId === 'bigint') return Number(chainId);
  if (typeof chainId === 'string') {
    const trimmed = chainId.trim();
    if (trimmed.toLowerCase().startsWith('0x')) {
      const parsed = parseInt(trimmed, 16);
      return isNaN(parsed) ? null : parsed;
    }
    const parsed = Number(trimmed);
    return isNaN(parsed) ? null : Math.floor(parsed);
  }
  return null;
}

/**
 * Maps known EVM chain IDs to user-friendly network names.
 * @param {number|bigint|string} chainId - Chain ID.
 * @returns {string} Human-readable network name.
 */
export function formatChainName(chainId) {
  const id = parseChainId(chainId);
  if (id === null) return 'Unknown Network';

  switch (id) {
    case 11155111:
      return 'Ethereum Sepolia';
    case 1:
      return 'Ethereum Mainnet';
    case 17000:
      return 'Holesky Testnet';
    case 137:
      return 'Polygon Mainnet';
    case 80002:
      return 'Polygon Amoy Testnet';
    case 421614:
      return 'Arbitrum Sepolia';
    default:
      return `Chain ID: ${id}`;
  }
}

/**
 * Checks if a string is a valid Ethereum address.
 * @param {string} address
 * @returns {boolean}
 */
export function isValidAddress(address) {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Formats a Unix timestamp into a localized readable date/time.
 * @param {number|bigint} timestamp
 * @returns {string}
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  const millis = Number(timestamp) * 1000;
  return new Date(millis).toLocaleString();
}

/**
 * Returns the public block explorer transaction URL.
 * Supports either (txHash) defaulting to Sepolia, or (chainId, txHash).
 * @param {number|string} chainIdOrTxHash
 * @param {string} [maybeTxHash]
 * @returns {string}
 */
export function getExplorerTxUrl(chainIdOrTxHash, maybeTxHash) {
  let chainId = 11155111;
  let txHash = chainIdOrTxHash;

  if (maybeTxHash) {
    chainId = Number(chainIdOrTxHash) || 11155111;
    txHash = maybeTxHash;
  }

  if (!txHash) return '';

  switch (Number(chainId)) {
    case 1:
      return `https://etherscan.io/tx/${txHash}`;
    case 17000:
      return `https://holesky.etherscan.io/tx/${txHash}`;
    case 137:
      return `https://polygonscan.com/tx/${txHash}`;
    case 80002:
      return `https://amoy.polygonscan.com/tx/${txHash}`;
    case 11155111:
    default:
      return `https://sepolia.etherscan.io/tx/${txHash}`;
  }
}

/**
 * Returns the public block explorer address URL.
 * Supports either (address) defaulting to Sepolia, or (chainId, address).
 * @param {number|string} chainIdOrAddress
 * @param {string} [maybeAddress]
 * @returns {string}
 */
export function getExplorerAddressUrl(chainIdOrAddress, maybeAddress) {
  let chainId = 11155111;
  let address = chainIdOrAddress;

  if (maybeAddress) {
    chainId = Number(chainIdOrAddress) || 11155111;
    address = maybeAddress;
  }

  if (!address) return '';

  switch (Number(chainId)) {
    case 1:
      return `https://etherscan.io/address/${address}`;
    case 17000:
      return `https://holesky.etherscan.io/address/${address}`;
    case 137:
      return `https://polygonscan.com/address/${address}`;
    case 80002:
      return `https://amoy.polygonscan.com/address/${address}`;
    case 11155111:
    default:
      return `https://sepolia.etherscan.io/address/${address}`;
  }
}
