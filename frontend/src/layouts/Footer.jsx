import React from 'react';
import { useRouter } from '../hooks/useRouter';

export function Footer() {
  const { navigate } = useRouter();

  return (
    <footer className="mt-auto border-t border-slate-200/90 bg-white text-slate-600 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-slate-100">
          {/* Brand Info */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                🏛️
              </div>
              <span className="font-extrabold text-sm text-slate-900 tracking-tight">
                Public Grievance Tracking System
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-md leading-relaxed">
              A decentralized civic technology protocol on Ethereum Sepolia ensuring tamper-evident record keeping, deterministic SLA escalations, and cryptographically verified public departmental accountability.
            </p>
            <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Network: Ethereum Sepolia (Chain ID 11155111)</span>
            </div>
          </div>

          {/* Quick Navigation */}
          <div>
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3">
              Citizen Services
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  Public Portal
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/citizen/submit')}
                  className="text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  Submit a Grievance
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/citizen')}
                  className="text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  Track Grievances
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/verify')}
                  className="text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  Verify On-Chain Record
                </button>
              </li>
            </ul>
          </div>

          {/* System & Protocols */}
          <div>
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3">
              Protocol Governance
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/debug/blockchain')}
                  className="text-slate-500 hover:text-blue-600 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>Blockchain Diagnostics</span>
                  <span>↗</span>
                </button>
              </li>
              <li>
                <a
                  href="https://sepolia.etherscan.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-blue-600 transition-colors inline-flex items-center gap-1"
                >
                  <span>Sepolia Block Explorer</span>
                  <span>↗</span>
                </a>
              </li>
              <li>
                <span className="text-slate-400">Solidity 0.8.28 • Ethers.js v6</span>
              </li>
              <li>
                <span className="text-slate-400">IPFS Forensic Hashing (Keccak-256)</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <p>© {new Date().getFullYear()} Republic Public Administration. Non-custodial Web3 smart contracts.</p>
          <div className="flex items-center gap-4">
            <span className="text-slate-500">Zero Centralized Intermediaries</span>
            <span>•</span>
            <span className="text-slate-500">Immutable Audit Trail</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
