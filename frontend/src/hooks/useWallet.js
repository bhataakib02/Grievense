import { useContext } from 'react';
import { WalletContext } from '../context/WalletContextDefinition';


/**
 * Custom hook to access wallet state and actions.
 * @returns {{
 *   address: string | null,
 *   provider: any,
 *   signer: any,
 *   chainId: number | null,
 *   networkName: string,
 *   isConnected: boolean,
 *   isConnecting: boolean,
 *   error: string | null,
 *   hasMetaMask: boolean,
 *   connectWallet: () => Promise<void>,
 *   disconnectWallet: () => void,
 *   clearError: () => void
 * }}
 */
export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
