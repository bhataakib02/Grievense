import React, { useState } from 'react';
import { ConnectButton } from '../components/wallet/ConnectButton';
import { useWallet } from '../hooks/useWallet';
import { useRoles } from '../hooks/useRoles';
import { useRouter } from '../hooks/useRouter';
import { Badge } from '../components/common/Badge';
import { formatChainName, shortenAddress } from '../utils/formatters';

export function Header() {
  const { isConnected, networkName, chainId, switchToTargetNetwork, diagnostics } = useWallet();
  const { activeRoles, currentRole, highestRole, isSupportedNetwork, targetChainId, ROLE_METADATA } = useRoles();
  const { currentRoute, navigate } = useRouter();

  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(null);
  const [showDevDetails, setShowDevDetails] = useState(false);

  const targetNetworkName = targetChainId ? formatChainName(targetChainId) : 'Ethereum Sepolia';

  const activeDashboardRoute = currentRole && ROLE_METADATA[currentRole]
    ? ROLE_METADATA[currentRole].dashboardRoute
    : (highestRole && ROLE_METADATA[highestRole] ? ROLE_METADATA[highestRole].dashboardRoute : '#/');

  const handleSwitchNetwork = async () => {
    setIsSwitching(true);
    setSwitchError(null);
    try {
      await switchToTargetNetwork(targetChainId || 11155111);
    } catch (err) {
      setSwitchError(err?.message || 'Failed to switch network.');
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
      {/* Required System Environment Status Bar */}
      <div className="bg-slate-950 text-slate-300 text-xs px-4 py-1.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 font-mono">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-slate-400">Environment:</span>
            <strong className="text-slate-100">Ethereum Sepolia Testnet</strong>
          </div>
          <div className="hidden xs:block text-slate-600">•</div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Blockchain:</span>
            <strong className="text-cyan-300">{formatChainName(chainId || targetChainId || 11155111)}</strong>
          </div>
          <div className="hidden xs:block text-slate-600">•</div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Chain ID:</span>
            <strong className="text-yellow-300">{chainId || targetChainId || 11155111}</strong>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Wallet:</span>
            {isConnected && diagnostics?.address ? (
              <span className="text-emerald-400 font-semibold">{shortenAddress(diagnostics.address)} (Connected)</span>
            ) : isConnected ? (
              <span className="text-emerald-400 font-semibold">Connected</span>
            ) : (
              <span className="text-amber-400 font-semibold">Disconnected</span>
            )}
          </div>
          <button
            onClick={() => navigate('/debug/blockchain')}
            type="button"
            className="text-slate-400 hover:text-white underline text-[11px] cursor-pointer"
          >
            Diagnostics
          </button>
        </div>
      </div>

      {/* Network mismatch alert bar if connected to unsupported network */}
      {isConnected && !isSupportedNetwork && (
        <div className="bg-amber-500 text-slate-900 px-4 py-2 text-center text-xs font-semibold flex flex-wrap items-center justify-center gap-3 shadow-xs">
          <div className="flex items-center gap-1.5">
            <span>⚠️ Unsupported Network:</span>
            <span>Please switch your wallet to Ethereum Sepolia (Chain ID 11155111). Current network: {networkName || 'Unknown'} (Chain ID: {chainId || 'None'}).</span>
          </div>
          <button
            onClick={handleSwitchNetwork}
            disabled={isSwitching}
            type="button"
            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-md transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isSwitching ? 'Requesting Switch...' : `Switch to ${targetNetworkName} (${targetChainId})`}
          </button>
          {switchError && (
            <span className="text-[11px] text-rose-900 font-bold bg-amber-200 px-2 py-0.5 rounded">
              {switchError}
            </span>
          )}
        </div>
      )}

      {/* DEV Diagnostics Bar (Task D Requirement) */}
      {import.meta.env.DEV && (
        <div className="bg-slate-900 text-slate-200 text-[11px] font-mono px-4 py-1 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-amber-400 font-bold">🛠️ DEV Diagnostics:</span>
            <span>Provider: <strong className="text-white">{diagnostics?.selectedProvider?.isGenuineMetaMask ? 'MetaMask (Genuine)' : (diagnostics?.selectedProvider?.isPhantom ? 'Phantom' : (diagnostics?.selectedProvider?.isMetaMask ? 'MetaMask' : 'Unknown'))}</strong></span>
            <span>Raw eth_chainId: <strong className="text-emerald-400">{diagnostics?.selectedProvider?.rawEthChainId || (typeof window !== 'undefined' ? window.ethereum?.chainId : 'N/A')}</strong></span>
            <span>window.ethereum.chainId: <strong className="text-cyan-400">{typeof window !== 'undefined' ? String(window.ethereum?.chainId) : 'N/A'}</strong></span>
            <span>Parsed chainId: <strong className="text-yellow-400">{String(chainId)}</strong></span>
            <span>Target: <strong className="text-blue-400">{String(targetChainId)}</strong></span>
            <span>Supported: <strong className={isSupportedNetwork ? 'text-emerald-400' : 'text-rose-400'}>{String(isSupportedNetwork)}</strong></span>
            <span>Network: <strong className="text-white">{networkName || 'None'}</strong></span>
            <span>Providers Count: <strong className="text-purple-400">{diagnostics?.providersCount ?? (typeof window !== 'undefined' && window.ethereum?.providers ? window.ethereum.providers.length : 1)}</strong></span>
          </div>
          <button
            onClick={() => setShowDevDetails((prev) => !prev)}
            type="button"
            className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
          >
            {showDevDetails ? 'Hide Provider Details' : 'Show Provider Details'}
          </button>
          {showDevDetails && diagnostics?.providersSummary && (
            <div className="w-full bg-slate-950 p-2 rounded text-[10px] mt-1 space-y-1">
              <div className="text-slate-400 font-bold">Detected Providers in window.ethereum.providers:</div>
              {diagnostics.providersSummary.map((p) => (
                <div key={p.index} className="flex gap-3 text-slate-300">
                  <span>#{p.index}</span>
                  <span>isMetaMask: {String(p.isMetaMask)}</span>
                  <span>isGenuine: {String(p.isGenuineMetaMask)}</span>
                  <span>isPhantom: {String(p.isPhantom)}</span>
                  <span>chainId: {String(p.chainId)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo / Branding */}
          <div
            onClick={() => navigate('/')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-xs group-hover:bg-blue-700 transition-colors">
              🏛️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest font-semibold text-blue-700">
                  Republic Portal
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-1.5 py-0.2 rounded">
                  Web3 DApp
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight">
                Public Grievance Tracking System
              </h1>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => navigate('/')}
              type="button"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                currentRoute === '/'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Public Portal
            </button>

            <button
              onClick={() => navigate('/verify')}
              type="button"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                currentRoute.startsWith('/verify')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Verify On-Chain
            </button>

            <button
              onClick={() => navigate('/debug/blockchain')}
              type="button"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                currentRoute.startsWith('/debug/blockchain')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Diagnostics
            </button>

            {isConnected && activeRoles.length > 0 && (
              <button
                onClick={() => navigate(activeDashboardRoute.slice(1))}
                type="button"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  currentRoute !== '/' && !currentRoute.startsWith('/unauthorized') && !currentRoute.startsWith('/verify')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span>Console ({ROLE_METADATA[currentRole]?.label || 'Dashboard'})</span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              </button>
            )}
          </nav>

          {/* User Roles & Wallet Area */}
          <div className="flex items-center gap-3">
            {/* Active role badges */}
            {isConnected && activeRoles.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5">
                {activeRoles.map((role) => (
                  <Badge
                    key={role}
                    variant={ROLE_METADATA[role]?.badgeVariant}
                    className="text-[11px]"
                  >
                    {ROLE_METADATA[role]?.label}
                  </Badge>
                ))}
              </div>
            )}

            {/* Wallet button & dropdown */}
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}
