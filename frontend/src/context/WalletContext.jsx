import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import {
  isWalletInstalled,
  getEthereumProvider,
  parseWalletError,
  switchToTargetChain,
  collectProviderDiagnostics,
  isGenuineMetaMask,
} from '../services/wallet.js';
import { formatChainName, parseChainId } from '../utils/formatters.js';
import { WalletContext } from './WalletContextDefinition';

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [networkName, setNetworkName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);

  const hasMetaMask = useMemo(() => isWalletInstalled(), []);

  // Disconnect UI state
  const disconnectWallet = useCallback(() => {
    setAddress(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
    setNetworkName('');
    setIsConnected(false);
    setError(null);
  }, []);

  // Updates wallet state from a connected provider and signer
  const syncWalletState = useCallback(async (browserProvider, chainIdHint = null) => {
    try {
      const eth = getEthereumProvider();
      if (!eth) {
        disconnectWallet();
        return;
      }

      const accounts = await browserProvider.send('eth_accounts', []);
      if (!accounts || accounts.length === 0) {
        disconnectWallet();
        return;
      }

      const activeSigner = await browserProvider.getSigner();
      const activeAddress = await activeSigner.getAddress();

      // Retrieve authoritative chain ID directly from MetaMask or event hint
      let rawChainId = chainIdHint;
      if (!rawChainId && eth.request) {
        try {
          rawChainId = await eth.request({ method: 'eth_chainId' });
        } catch (e) {
          console.warn('[WalletContext] eth_chainId request error:', e);
        }
      }

      let numericChainId = parseChainId(rawChainId);
      if (numericChainId === null) {
        try {
          const network = await browserProvider.getNetwork();
          numericChainId = parseChainId(network.chainId);
        } catch (e) {
          console.warn('[WalletContext] getNetwork error:', e);
        }
      }

      const computedNetwork = formatChainName(numericChainId);
      const targetChainIdNum = parseChainId(import.meta.env.VITE_TARGET_CHAIN_ID || import.meta.env.VITE_CHAIN_ID) || 11155111;
      const isSupported = targetChainIdNum ? numericChainId === targetChainIdNum : true;

      // Development diagnostics collection
      let diagData = null;
      if (import.meta.env.DEV) {
        try {
          diagData = await collectProviderDiagnostics();
        } catch (diagErr) {
          console.warn('[WalletContext] Diagnostics collection warning:', diagErr);
        }

        console.log('[WalletContext] Network state synced:', {
          account: activeAddress,
          rawMetaMaskChainId: rawChainId,
          windowEthereumChainId: typeof window !== 'undefined' ? window.ethereum?.chainId : null,
          parsedNumericChainId: numericChainId,
          targetChainId: targetChainIdNum,
          computedNetworkName: computedNetwork,
          isSupportedNetwork: isSupported,
          isGenuineMetaMask: isGenuineMetaMask(eth),
          diagnostics: diagData,
        });
      }

      setProvider(browserProvider);
      setSigner(activeSigner);
      setAddress(activeAddress);
      setChainId(numericChainId);
      setNetworkName(computedNetwork);
      setIsConnected(true);
      setError(null);
      if (diagData) {
        setDiagnostics(diagData);
      }
    } catch (err) {
      console.error('Error syncing wallet state:', err);
      const parsed = parseWalletError(err);
      setError(parsed.message);
      disconnectWallet();
    }
  }, [disconnectWallet]);

  // Connects wallet via eth_requestAccounts
  const connectWallet = useCallback(async () => {
    const eth = getEthereumProvider();
    if (!eth) {
      setError('No compatible browser wallet found. Please install MetaMask to interact with the DApp.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Use 'any' network so BrowserProvider does not throw on chain switching
      const browserProvider = new ethers.BrowserProvider(eth, 'any');

      // Request user account authorization
      await browserProvider.send('eth_requestAccounts', []);

      await syncWalletState(browserProvider);
    } catch (err) {
      console.error('Wallet connection error:', err);
      const parsed = parseWalletError(err);
      setError(parsed.message);
      disconnectWallet();
    } finally {
      setIsConnecting(false);
    }
  }, [syncWalletState, disconnectWallet]);

  // Requests the wallet to switch to the target chain ID
  const switchToTargetNetwork = useCallback(
    async (targetId = null) => {
      const target = targetId || parseChainId(import.meta.env.VITE_TARGET_CHAIN_ID || import.meta.env.VITE_CHAIN_ID) || 11155111;
      if (!target) {
        const msg = 'Target network chain ID is not configured. Set VITE_CHAIN_ID in frontend/.env.';
        setError(msg);
        throw new Error(msg);
      }
      setError(null);
      try {
        await switchToTargetChain(target);
        const eth = getEthereumProvider();
        if (eth) {
          const browserProvider = new ethers.BrowserProvider(eth, 'any');
          await syncWalletState(browserProvider);
        }
      } catch (err) {
        console.error('Failed to switch network:', err);
        const parsed = parseWalletError(err);
        setError(parsed.message);
        throw err;
      }
    },
    [syncWalletState]
  );

  // Listen for account and chain changes
  useEffect(() => {
    const eth = getEthereumProvider();
    if (!eth) return;

    // Silently check if already connected
    const checkExistingConnection = async () => {
      try {
        const accounts = await eth.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          const browserProvider = new ethers.BrowserProvider(eth, 'any');
          await syncWalletState(browserProvider);
        }
      } catch (e) {
        console.warn('Could not check existing connection:', e);
      }
    };

    checkExistingConnection();

    const handleAccountsChanged = (accounts) => {
      if (import.meta.env.DEV) {
        console.log('[WalletContext] accountsChanged event received:', accounts);
      }
      if (!accounts || accounts.length === 0) {
        disconnectWallet();
      } else {
        const currentEth = getEthereumProvider() || eth;
        const browserProvider = new ethers.BrowserProvider(currentEth, 'any');
        syncWalletState(browserProvider);
      }
    };

    const handleChainChanged = (chainIdHex) => {
      if (import.meta.env.DEV) {
        console.log('[WalletContext] chainChanged event received:', chainIdHex);
      }
      // Re-initialize provider on chain change to avoid stale network states
      const currentEth = getEthereumProvider() || eth;
      const browserProvider = new ethers.BrowserProvider(currentEth, 'any');
      syncWalletState(browserProvider, chainIdHex);
    };

    eth.on('accountsChanged', handleAccountsChanged);
    eth.on('chainChanged', handleChainChanged);

    return () => {
      if (typeof eth.removeListener === 'function') {
        eth.removeListener('accountsChanged', handleAccountsChanged);
        eth.removeListener('chainChanged', handleChainChanged);
      } else if (typeof eth.off === 'function') {
        eth.off('accountsChanged', handleAccountsChanged);
        eth.off('chainChanged', handleChainChanged);
      }
    };
  }, [syncWalletState, disconnectWallet]);

  const value = useMemo(
    () => ({
      address,
      provider,
      signer,
      chainId,
      networkName,
      isConnected,
      isConnecting,
      error,
      hasMetaMask,
      diagnostics,
      connectWallet,
      disconnectWallet,
      switchToTargetNetwork,
      clearError: () => setError(null),
    }),
    [
      address,
      provider,
      signer,
      chainId,
      networkName,
      isConnected,
      isConnecting,
      error,
      hasMetaMask,
      diagnostics,
      connectWallet,
      disconnectWallet,
      switchToTargetNetwork,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
