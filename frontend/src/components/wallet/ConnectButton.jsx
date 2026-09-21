import React, { useState } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { shortenAddress } from '../../utils/formatters';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export function ConnectButton() {
  const {
    address,
    chainId,
    networkName,
    isConnected,
    isConnecting,
    hasMetaMask,
    connectWallet,
    disconnectWallet,
  } = useWallet();

  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!hasMetaMask) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
        Install MetaMask
      </a>
    );
  }

  if (!isConnected) {
    return (
      <Button
        onClick={connectWallet}
        loading={isConnecting}
        variant="primary"
        size="md"
        className="shadow-sm font-semibold"
      >
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </Button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 shadow-2xs">
        {/* Network Pill */}
        <Badge variant="primary" className="hidden sm:inline-flex py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          {networkName}
        </Badge>

        {/* Address & Menu Trigger */}
        <button
          onClick={() => setShowDropdown((prev) => !prev)}
          type="button"
          className="flex items-center gap-2 px-2.5 py-1 text-sm font-medium text-slate-700 hover:text-slate-900 rounded-md hover:bg-slate-50 transition-colors"
          title="Click to view wallet details or disconnect"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="font-mono text-xs sm:text-sm font-semibold text-slate-800">
            {shortenAddress(address, 4)}
          </span>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown Menu */}
      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-200 z-30 p-3 text-left">
            <div className="border-b border-slate-100 pb-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Connected Account
              </span>
              <p className="font-mono text-xs text-slate-800 break-all mt-1 bg-slate-50 p-1.5 rounded border border-slate-100">
                {address}
              </p>
            </div>

            <div className="text-xs text-slate-600 mb-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Network:</span>
                <span className="font-medium text-slate-800">{networkName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Chain ID:</span>
                <span className="font-mono text-slate-800">{chainId}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1 text-xs"
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy Address'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => {
                  setShowDropdown(false);
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
  );
}
