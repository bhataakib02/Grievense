import React from 'react';
import { useWallet } from '../../hooks/useWallet';
import { useRouter } from '../../hooks/useRouter';
import { CONTRACT_NAMES, getContractConfigurationStatus } from '../../contracts/addresses';

export function BlockchainNetworkCard() {
  const { isConnected, networkName, chainId } = useWallet();
  const { isConfigured, configured } = getContractConfigurationStatus();
  const { navigate } = useRouter();

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs civic-card-hover">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 text-lg font-bold">
            ⛓️
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              System Infrastructure
            </span>
            <h3 className="text-base font-bold text-slate-900 leading-tight">
              Blockchain Network
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/debug/blockchain')}
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer self-start md:self-auto"
        >
          <span>View Blockchain Details</span>
          <span>→</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
        {/* Network & Chain */}
        <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
          <span className="text-[11px] font-medium text-slate-500 block">Target Network</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs sm:text-sm font-bold text-slate-900">
              {networkName || 'Ethereum Sepolia'}
            </span>
          </div>
        </div>

        {/* Chain ID */}
        <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
          <span className="text-[11px] font-medium text-slate-500 block">Chain ID</span>
          <span className="text-xs sm:text-sm font-mono font-bold text-slate-900 mt-1 block">
            {chainId || 11155111}
          </span>
        </div>

        {/* Wallet Status */}
        <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
          <span className="text-[11px] font-medium text-slate-500 block">Wallet Connection</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-400'}`}
            ></span>
            <span className="text-xs sm:text-sm font-bold text-slate-900">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Contract Configuration */}
        <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
          <span className="text-[11px] font-medium text-slate-500 block">Smart Contracts</span>
          <span className="text-xs sm:text-sm font-bold text-slate-900 mt-1 block">
            {isConfigured ? '5 / 5 Configured' : `${configured.length} / ${CONTRACT_NAMES.length} Configured`}
          </span>
        </div>
      </div>
    </div>
  );
}
