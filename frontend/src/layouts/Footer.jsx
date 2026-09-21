import React from 'react';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white text-slate-600 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-slate-100">
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">About The System</h4>
            <p className="text-slate-500 leading-relaxed">
              A decentralized, public grievance resolution network powered by Ethereum smart contracts. Providing tamper-evident record keeping, automated SLA tracking, and cryptographic accountability across public departments.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Non-Custodial Architecture</h4>
            <p className="text-slate-500 leading-relaxed">
              The application connects directly from your browser to the blockchain via MetaMask. No centralized databases, private key custody, or third-party intermediaries are involved in state transitions.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Cryptographic Transparency</h4>
            <p className="text-slate-500 leading-relaxed">
              Every departmental registration, officer assignment, investigation step, and citizen confirmation emits verified events and permanent on-chain forensic audit trail entries.
            </p>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-400">
          <p>© {new Date().getFullYear()} Blockchain-Based Public Grievance Tracking System. Open Government Protocol.</p>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Solidity 0.8.28</span>
            <span>•</span>
            <span>Ethers.js v6</span>
            <span>•</span>
            <span>OpenZeppelin v5</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
