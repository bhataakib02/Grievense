import React, { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRoles } from '../hooks/useRoles';
import { useRouter } from '../hooks/useRouter';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { shortenAddress, getExplorerAddressUrl } from '../utils/formatters';

export function Header() {
  const {
    address,
    isConnected,
    isConnecting,
    hasMetaMask,
    connectWallet,
    disconnectWallet,
    switchToTargetNetwork,
  } = useWallet();

  const {
    activeRoles,
    currentRole,
    highestRole,
    isSupportedNetwork,
    targetChainId,
    ROLE_METADATA,
  } = useRoles();

  const { currentRoute, navigate } = useRouter();

  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(null);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeDashboardRoute =
    currentRole && ROLE_METADATA[currentRole]
      ? ROLE_METADATA[currentRole].dashboardRoute
      : highestRole && ROLE_METADATA[highestRole]
      ? ROLE_METADATA[highestRole].dashboardRoute
      : '/citizen';

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  const handleNavClick = (path, hash) => {
    setMobileMenuOpen(false);
    if (hash) {
      if (currentRoute === '/') {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate('/');
        setTimeout(() => {
          const el = document.getElementById(hash);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }
      return;
    }
    navigate(path);
  };

  const handleTrackGrievance = () => {
    setMobileMenuOpen(false);
    if (isConnected && activeRoles.length > 0) {
      navigate(activeDashboardRoute.startsWith('/') ? activeDashboardRoute : `/${activeDashboardRoute}`);
    } else {
      navigate('/citizen');
    }
  };

  const roleLabel = currentRole && ROLE_METADATA[currentRole]
    ? ROLE_METADATA[currentRole].label
    : highestRole && ROLE_METADATA[highestRole]
    ? ROLE_METADATA[highestRole].label
    : null;

  const roleVariant = currentRole && ROLE_METADATA[currentRole]
    ? ROLE_METADATA[currentRole].badgeVariant
    : 'primary';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs">
      {/* Network mismatch notice if connected to unsupported chain */}
      {isConnected && !isSupportedNetwork && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-1.5">
            <span>⚠️ Unsupported Network:</span>
            <span>Please switch to Ethereum Sepolia (Chain ID 11155111).</span>
          </div>
          <button
            onClick={handleSwitchNetwork}
            disabled={isSwitching}
            type="button"
            className="px-3 py-1 bg-slate-950 hover:bg-slate-850 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSwitching ? 'Switching...' : 'Switch to Ethereum Sepolia'}
          </button>
          {switchError && (
            <span className="text-[11px] text-rose-950 bg-amber-200 px-2 py-0.5 rounded">
              {switchError}
            </span>
          )}
        </div>
      )}

      {/* Main Header Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18">
          {/* Left: Emblem + Brand Title */}
          <div
            onClick={() => handleNavClick('/')}
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-xl shadow-xs group-hover:bg-blue-900 transition-colors">
              🏛️
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 leading-none group-hover:text-blue-600 transition-colors">
                PUBLIC GRIEVANCE
              </span>
              <span className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-tight">
                TRACKING SYSTEM
              </span>
            </div>
          </div>

          {/* Center: Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => handleNavClick('/')}
              type="button"
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                currentRoute === '/'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Home
            </button>

            <button
              onClick={() => handleNavClick('/')}
              type="button"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                currentRoute === '/'
                  ? 'text-slate-700 hover:bg-slate-50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Public Portal
            </button>

            <button
              onClick={handleTrackGrievance}
              type="button"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                currentRoute === '/citizen' || currentRoute.startsWith('/citizen/grievance')
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Track Grievance
            </button>

            <button
              onClick={() => handleNavClick('/verify')}
              type="button"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                currentRoute.startsWith('/verify')
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Verify On-Chain
            </button>

            <button
              onClick={() => handleNavClick('/', 'how-it-works')}
              type="button"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              How It Works
            </button>

            {/* If user has administrative / officer roles, show Console shortcut */}
            {isConnected && activeRoles.length > 0 && currentRole !== 'CITIZEN' && (
              <button
                onClick={() => navigate(activeDashboardRoute.startsWith('/') ? activeDashboardRoute : `/${activeDashboardRoute}`)}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ml-1 ${
                  currentRoute.startsWith('/officer') || currentRoute.startsWith('/dept-admin') || currentRoute.startsWith('/super-admin')
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                Officer Console
              </button>
            )}
          </nav>

          {/* Right: Network Status, Wallet & Role */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Network Status Pill */}
            <div className="hidden md:flex items-center">
              {isConnected && isSupportedNetwork ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] font-bold text-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Ethereum Sepolia</span>
                </div>
              ) : isConnected && !isSupportedNetwork ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-300 rounded-full text-[11px] font-bold text-amber-800">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>Wrong Network</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-full text-[11px] font-semibold text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  <span>Sepolia Network</span>
                </div>
              )}
            </div>

            {/* Role Badge (when connected) */}
            {isConnected && roleLabel && (
              <div className="hidden sm:block">
                <Badge variant={roleVariant} dot className="font-bold text-[11px] uppercase tracking-wider py-1">
                  {roleLabel}
                </Badge>
              </div>
            )}

            {/* Wallet Connect Button or Account Menu */}
            {!isConnected ? (
              hasMetaMask ? (
                <Button
                  onClick={connectWallet}
                  loading={isConnecting}
                  variant="primary"
                  size="sm"
                  className="shadow-xs font-bold"
                >
                  {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </Button>
              ) : (
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Install MetaMask
                </a>
              )
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowWalletMenu((prev) => !prev)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-xl text-xs font-semibold text-slate-800 transition-colors cursor-pointer shadow-2xs"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="font-mono">{shortenAddress(address, 4)}</span>
                  <svg
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showWalletMenu ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Account Menu Dropdown */}
                {showWalletMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowWalletMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-40 p-4 animate-modal text-left">
                      <div className="pb-3 border-b border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Connected Wallet
                          </span>
                          {roleLabel && (
                            <Badge variant={roleVariant} className="text-[10px]">
                              {roleLabel}
                            </Badge>
                          )}
                        </div>
                        <p className="font-mono text-xs text-slate-900 break-all mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                          {address}
                        </p>
                      </div>

                      <div className="py-2.5 text-xs text-slate-600 space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Network:</span>
                          <span className="font-semibold text-slate-800">Ethereum Sepolia</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Chain ID:</span>
                          <span className="font-mono text-slate-800">11155111</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Explorer:</span>
                          <a
                            href={getExplorerAddressUrl(address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 underline font-medium inline-flex items-center gap-0.5"
                          >
                            Sepolia Etherscan ↗
                          </a>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex gap-2">
                        <Button
                          variant="secondary"
                          size="xs"
                          className="flex-1"
                          onClick={handleCopy}
                        >
                          {copied ? '✓ Copied' : 'Copy Address'}
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          className="flex-1 text-rose-600 border-rose-200 hover:bg-rose-50"
                          onClick={() => {
                            setShowWalletMenu(false);
                            disconnectWallet();
                          }}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mobile Menu Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-100 py-3 space-y-1 bg-white animate-fade-in">
            <button
              onClick={() => handleNavClick('/')}
              className="w-full text-left px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              Home
            </button>
            <button
              onClick={() => handleNavClick('/')}
              className="w-full text-left px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              Public Portal
            </button>
            <button
              onClick={handleTrackGrievance}
              className="w-full text-left px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              Track Grievance
            </button>
            <button
              onClick={() => handleNavClick('/verify')}
              className="w-full text-left px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              Verify On-Chain
            </button>
            <button
              onClick={() => handleNavClick('/', 'how-it-works')}
              className="w-full text-left px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              How It Works
            </button>
            {isConnected && activeRoles.length > 0 && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(activeDashboardRoute.startsWith('/') ? activeDashboardRoute : `/${activeDashboardRoute}`);
                }}
                className="w-full text-left px-3 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 rounded-lg"
              >
                Go to {roleLabel || 'Role'} Console →
              </button>
            )}
            <div className="pt-2 px-3">
              <div className="text-[11px] text-slate-400 font-mono">
                Network: Ethereum Sepolia (11155111)
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
