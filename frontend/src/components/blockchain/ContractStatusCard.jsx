import React from 'react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { CONTRACT_NAMES, CONTRACT_ADDRESSES } from '../../contracts/addresses';
import { shortenAddress, isValidAddress } from '../../utils/formatters';
import { useContract } from '../../hooks/useContract';

export function ContractStatusCard() {
  const { isConfigured } = useContract();


  return (
    <Card
      title="Smart Contract Deployment Status"
      subtitle="Ethereum smart-contract addresses verified by the frontend"
      className="border-slate-200"
    >
      <div className="space-y-4">
        {/* Status banner */}
        {!isConfigured ? (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm flex items-start gap-2.5">
            <span className="text-base mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold">Contract deployment configuration incomplete.</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Smart contract addresses are not configured. Deploy the Solidity contracts via Remix IDE, configure their addresses in <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">frontend/.env</code>, and connect MetaMask. See <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">REMIX_DEPLOYMENT.md</code> for details.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-sm flex items-start gap-2.5">
            <span className="text-base mt-0.5">✅</span>
            <div>
              <p className="font-semibold">All 5 Contracts Configured</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                The frontend is connected to verified smart-contract instances on the blockchain.
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
                <th className="py-2.5 px-3 font-semibold text-right">Address Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {CONTRACT_NAMES.map((contract) => {
                const addr = CONTRACT_ADDRESSES[contract.key];
                const configured = addr && isValidAddress(addr);

                return (
                  <tr key={contract.key} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {contract.label}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {contract.description}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {configured ? (
                        <span className="font-mono text-slate-800 bg-slate-100 px-2 py-1 rounded border border-slate-200 inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          {shortenAddress(addr, 5)}
                        </span>
                      ) : (
                        <Badge variant="neutral">Not Configured</Badge>
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
            <span className="font-medium text-slate-700">Remix Deployment Configuration (frontend/.env):</span>
            <pre className="mt-1.5 p-2.5 bg-slate-900 text-slate-200 rounded-lg overflow-x-auto font-mono text-[11px] leading-relaxed">
{`# Copy deployed contract addresses from Remix IDE into frontend/.env:
VITE_ROLE_MANAGER_ADDRESS=0x...
VITE_DEPARTMENT_MANAGER_ADDRESS=0x...
VITE_GRIEVANCE_SYSTEM_ADDRESS=0x...
VITE_ESCALATION_MANAGER_ADDRESS=0x...
VITE_AUDIT_TRAIL_ADDRESS=0x...
VITE_TARGET_CHAIN_ID=11155111`}
            </pre>
          </div>
        )}
      </div>
    </Card>
  );
}
