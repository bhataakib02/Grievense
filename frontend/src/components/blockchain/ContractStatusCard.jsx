import React from 'react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { CONTRACT_NAMES, CONTRACT_ADDRESSES, getContractConfigurationStatus } from '../../contracts/addresses';
import { shortenAddress, isValidAddress, getExplorerAddressUrl } from '../../utils/formatters';

export function ContractStatusCard() {
  const { isConfigured, configured, missing } = getContractConfigurationStatus();

  return (
    <Card
      title="Ethereum Sepolia Contract Status"
      subtitle="Smart contract addresses and on-chain deployment status"
      className="border-slate-200"
    >
      <div className="space-y-4">
        {/* Status banner with granular count */}
        {!isConfigured ? (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm flex items-start gap-2.5">
            <span className="text-base mt-0.5">⚠️</span>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">
                  Contract Configuration: {configured.length} of {CONTRACT_NAMES.length} Configured
                </p>
                <Badge variant="warning" className="text-[10px]">
                  {missing.length} Missing
                </Badge>
              </div>
              <p className="text-xs text-amber-800 mt-1">
                To interact with smart contracts, deploy them to <strong className="text-amber-950">Ethereum Sepolia</strong> using Remix IDE with MetaMask. Then copy their deployed addresses into <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">frontend/.env</code>.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-sm flex items-start gap-2.5">
            <span className="text-base mt-0.5">✅</span>
            <div>
              <p className="font-semibold">All 5 Contracts Configured on Ethereum Sepolia</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                The frontend is connected to authoritative smart contracts deployed on Sepolia (Chain ID: 11155111).
              </p>
            </div>
          </div>
        )}

        {/* Contract list table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-y border-slate-100">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Contract</th>
                <th className="py-2.5 px-3 font-semibold">Role / Responsibility</th>
                <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                <th className="py-2.5 px-3 font-semibold text-right">Sepolia Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {CONTRACT_NAMES.map((contract) => {
                const addr = CONTRACT_ADDRESSES[contract.key];
                const isItemConfigured = Boolean(addr && isValidAddress(addr));

                return (
                  <tr key={contract.key} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {contract.label}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {contract.description}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {isItemConfigured ? (
                        <Badge variant="success" className="text-[10px]">Configured</Badge>
                      ) : (
                        <Badge variant="warning" className="text-[10px]">Awaiting Address</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {isItemConfigured ? (
                        <a
                          href={getExplorerAddressUrl(addr)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded border border-blue-200 inline-flex items-center gap-1.5 transition-colors"
                          title="View on Sepolia Etherscan"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          {shortenAddress(addr, 5)} ↗
                        </a>
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">Not configured</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Configuration instructions snippet */}
        {!isConfigured && (
          <div className="pt-2 text-xs text-slate-500 border-t border-slate-100">
            <span className="font-medium text-slate-700">Environment Configuration (frontend/.env):</span>
            <pre className="mt-1.5 p-2.5 bg-slate-900 text-slate-200 rounded-lg overflow-x-auto font-mono text-[11px] leading-relaxed">
{`# Set deployed Sepolia contract addresses in frontend/.env:
VITE_ROLE_MANAGER_ADDRESS=0x...
VITE_DEPARTMENT_MANAGER_ADDRESS=0x...
VITE_GRIEVANCE_SYSTEM_ADDRESS=0x...
VITE_ESCALATION_MANAGER_ADDRESS=0x...
VITE_AUDIT_TRAIL_ADDRESS=0x...
VITE_CHAIN_ID=11155111
VITE_NETWORK_NAME=Sepolia`}
            </pre>
          </div>
        )}
      </div>
    </Card>
  );
}
