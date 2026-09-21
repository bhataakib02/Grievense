/**
 * Wallet service for detecting and interfacing with browser wallets (MetaMask, Rabby, etc.)
 */

export const WalletErrorCodes = {
  NOT_INSTALLED: 'WALLET_NOT_INSTALLED',
  USER_REJECTED: 'USER_REJECTED',
  PENDING_REQUEST: 'PENDING_REQUEST',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR',
};

/**
 * Detects if a provider instance is genuinely MetaMask and not a third-party wrapper
 * (such as Phantom, Coinbase Wallet, Brave, or Rabby) that also sets isMetaMask = true.
 * @param {any} p
 * @returns {boolean}
 */
export function isGenuineMetaMask(p) {
  if (!p || !p.isMetaMask) return false;
  if (p.isPhantom || p.isCoinbaseWallet || p.isBraveWallet || p.isRabby || p.isBitKeep) {
    return false;
  }
  return true;
}

/**
 * Checks if a browser Ethereum provider (like MetaMask) is injected.
 * @returns {boolean}
 */
export function isWalletInstalled() {
  if (typeof window === 'undefined') return false;
  if (Array.isArray(window.ethereum?.providers) && window.ethereum.providers.length > 0) {
    return window.ethereum.providers.some((p) => p.isMetaMask) || Boolean(window.ethereum);
  }
  return Boolean(window.ethereum);
}

/**
 * Returns the injected window.ethereum provider (prioritizing genuine MetaMask if multiple wallets are present)
 * or throws a descriptive error.
 * @param {boolean} throwOnError
 * @returns {any}
 */
export function getEthereumProvider(throwOnError = false) {
  if (typeof window === 'undefined') {
    return null;
  }

  // Handle multiple injected wallet extensions (e.g. MetaMask + Phantom + Coinbase)
  if (Array.isArray(window.ethereum?.providers) && window.ethereum.providers.length > 0) {
    // 1. Highest priority: genuine MetaMask (flags isMetaMask AND not third-party wrapper)
    const genuineMetaMask = window.ethereum.providers.find((p) => isGenuineMetaMask(p));
    if (genuineMetaMask) return genuineMetaMask;

    // 2. Secondary check: MetaMask's unique _metamask internal property
    const metamaskWithProp = window.ethereum.providers.find((p) => Boolean(p._metamask));
    if (metamaskWithProp) return metamaskWithProp;

    // 3. Fallback to any provider with isMetaMask
    const metaMaskFallback = window.ethereum.providers.find((p) => p.isMetaMask);
    if (metaMaskFallback) return metaMaskFallback;

    return window.ethereum.providers[0];
  }

  if (window.ethereum) {
    return window.ethereum;
  }

  if (throwOnError) {
    const error = new Error('No compatible Ethereum browser wallet detected. Please install MetaMask to continue.');
    error.code = WalletErrorCodes.NOT_INSTALLED;
    throw error;
  }

  return null;
}

/**
 * Returns network configuration for EIP-3085 wallet_addEthereumChain.
 * @param {number|string} chainId
 * @returns {object|null}
 */
export function getChainConfig(chainId) {
  const numericId = Number(chainId);
  const hexChainId = '0x' + numericId.toString(16);

  // Check if configured via environment variables for custom chains/RPC
  const envTargetChain = typeof import.meta !== 'undefined' && (import.meta.env?.VITE_TARGET_CHAIN_ID || import.meta.env?.VITE_CHAIN_ID)
    ? parseInt(import.meta.env.VITE_TARGET_CHAIN_ID || import.meta.env.VITE_CHAIN_ID, 10)
    : 11155111;
  const envRpcUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_RPC_URL
    ? import.meta.env.VITE_RPC_URL
    : 'https://rpc.sepolia.org';

  if (numericId === 11155111 || (envTargetChain && numericId === envTargetChain)) {
    return {
      chainId: '0xaa36a7',
      chainName: 'Sepolia Testnet',
      nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: [envRpcUrl || 'https://rpc.sepolia.org', 'https://ethereum-sepolia-rpc.publicnode.com'],
      blockExplorerUrls: ['https://sepolia.etherscan.io'],
    };
  }

  switch (numericId) {
    case 17000:
      return {
        chainId: hexChainId,
        chainName: 'Holesky Testnet',
        nativeCurrency: { name: 'HoleskyETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://ethereum-holesky-rpc.publicnode.com'],
        blockExplorerUrls: ['https://holesky.etherscan.io'],
      };
    case 80002:
      return {
        chainId: hexChainId,
        chainName: 'Polygon Amoy Testnet',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://rpc-amoy.polygon.technology'],
        blockExplorerUrls: ['https://amoy.polygonscan.com'],
      };
    case 421614:
      return {
        chainId: hexChainId,
        chainName: 'Arbitrum Sepolia Testnet',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
        blockExplorerUrls: ['https://sepolia.arbiscan.io'],
      };
    default:
      return null;
  }
}

/**
 * Requests the connected wallet to switch to the target chain ID (Ethereum Sepolia).
 * If the chain is not recognized by the wallet (EIP-3326 error 4902),
 * it attempts to add the chain via EIP-3085 wallet_addEthereumChain.
 *
 * @param {number|string} [targetChainId]
 * @returns {Promise<void>}
 */
export async function switchToTargetChain(targetChainId) {
  const resolvedTargetId = targetChainId || (
    typeof import.meta !== 'undefined' && (import.meta.env?.VITE_TARGET_CHAIN_ID || import.meta.env?.VITE_CHAIN_ID)
      ? parseInt(import.meta.env.VITE_TARGET_CHAIN_ID || import.meta.env.VITE_CHAIN_ID, 10)
      : 11155111
  );

  const eth = getEthereumProvider(true);
  const numericId = typeof resolvedTargetId === 'string' ? parseInt(resolvedTargetId, 10) : resolvedTargetId;
  const hexChainId = '0x' + Number(numericId).toString(16);

  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
  } catch (switchError) {
    // 4902 error code indicates the chain has not been added to the wallet
    if (
      switchError.code === 4902 ||
      switchError.message?.includes('4902') ||
      switchError.message?.includes('Unrecognized') ||
      switchError.message?.includes('wallet_addEthereumChain')
    ) {
      const config = getChainConfig(numericId);
      if (!config) {
        throw switchError;
      }
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [config],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Collects runtime diagnostics about injected providers.
 * Safe for DEV debugging.
 * @returns {Promise<object>}
 */
export async function collectProviderDiagnostics() {
  if (typeof window === 'undefined') {
    return { status: 'SSR / No window' };
  }

  const eth = window.ethereum;
  const providers = Array.isArray(eth?.providers) ? eth.providers : null;
  const selected = getEthereumProvider();

  let selectedRawChainId = null;
  let selectedAccounts = [];
  if (selected?.request) {
    try {
      selectedRawChainId = await selected.request({ method: 'eth_chainId' });
    } catch (e) {
      selectedRawChainId = `Error: ${e.message}`;
    }
    try {
      selectedAccounts = await selected.request({ method: 'eth_accounts' });
    } catch (e) {
      selectedAccounts = [`Error: ${e.message}`];
    }
  }

  return {
    hasWindowEthereum: Boolean(eth),
    windowEthereumChainId: eth?.chainId || null,
    windowEthereumIsMetaMask: Boolean(eth?.isMetaMask),
    windowEthereumIsPhantom: Boolean(eth?.isPhantom),
    providersCount: providers ? providers.length : (eth ? 1 : 0),
    providersSummary: providers
      ? providers.map((p, idx) => ({
          index: idx,
          isMetaMask: Boolean(p.isMetaMask),
          isPhantom: Boolean(p.isPhantom),
          isCoinbase: Boolean(p.isCoinbaseWallet),
          isGenuineMetaMask: isGenuineMetaMask(p),
          hasInternalProp: Boolean(p._metamask),
          chainId: p.chainId,
        }))
      : null,
    selectedProvider: {
      isGenuineMetaMask: isGenuineMetaMask(selected),
      isMetaMask: Boolean(selected?.isMetaMask),
      isPhantom: Boolean(selected?.isPhantom),
      rawEthChainId: selectedRawChainId,
      accounts: selectedAccounts,
    },
  };
}

/**
 * Translates low-level provider/RPC errors into user-friendly messages.
 * @param {any} err
 * @returns {{ code: string, message: string }}
 */
export function parseWalletError(err) {
  if (!err) {
    return { code: WalletErrorCodes.UNKNOWN, message: 'An unknown wallet error occurred.' };
  }

  // User rejected request (EIP-1193 code 4001)
  if (err.code === 4001 || err.message?.includes('User rejected') || err.message?.includes('ACTION_REJECTED')) {
    return {
      code: WalletErrorCodes.USER_REJECTED,
      message: 'Connection request was cancelled by the user.',
    };
  }

  // Already pending request (code -32002)
  if (err.code === -32002) {
    return {
      code: WalletErrorCodes.PENDING_REQUEST,
      message: 'A connection request is already pending in your wallet. Please check MetaMask.',
    };
  }

  if (err.code === WalletErrorCodes.NOT_INSTALLED) {
    return {
      code: WalletErrorCodes.NOT_INSTALLED,
      message: err.message,
    };
  }

  return {
    code: WalletErrorCodes.UNKNOWN,
    message: err.shortMessage || err.message || 'Failed to connect to wallet.',
  };
}
