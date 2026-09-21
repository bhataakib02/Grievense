import React from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRoles } from '../hooks/useRoles';
import { useRouter } from '../hooks/useRouter';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { shortenAddress } from '../utils/formatters';

export function UnauthorizedPage({ requiredRoles = [], userRoles = [] }) {
  const { address } = useWallet();
  const { highestRole, ROLE_METADATA } = useRoles();
  const { navigate } = useRouter();

  const highestDashboard = highestRole && ROLE_METADATA[highestRole]
    ? ROLE_METADATA[highestRole].dashboardRoute
    : '#/';

  return (
    <div className="max-w-xl mx-auto py-12">
      <Card
        title="Access Restricted: Insufficient On-Chain Privileges"
        className="border-rose-200"
      >
        <div className="space-y-6">
          <div className="flex items-start gap-4 p-4 bg-rose-50 border border-rose-100 rounded-lg text-rose-900">
            <span className="text-3xl">🚫</span>
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Role Authorization Required</h4>
              <p className="text-xs text-rose-800 leading-relaxed">
                Your connected wallet address does not hold the required on-chain role to access this administrative section. All actions are restricted at the smart-contract layer in <code className="font-mono bg-rose-100 px-1 py-0.5 rounded text-[11px]">RoleManager.sol</code>.
              </p>
            </div>
          </div>

          {/* Details Table */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-3">
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Connected Wallet:</span>
              <span className="font-mono text-slate-800 font-semibold">{shortenAddress(address, 6)}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Required Role(s):</span>
              <div className="flex gap-1.5">
                {requiredRoles.map((r) => (
                  <Badge key={r} variant="danger">
                    {ROLE_METADATA[r]?.label || r}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Detected Role(s) on Wallet:</span>
              <div className="flex gap-1.5 flex-wrap justify-end">
                {userRoles.length > 0 ? (
                  userRoles.map((r) => (
                    <Badge key={r} variant="primary">
                      {ROLE_METADATA[r]?.label || r}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="neutral">No Active Roles</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-2">
            <span>ℹ️</span>
            <p>
              <strong>Security Architecture Note:</strong> Frontend route protection is solely for user experience. Even if modified client-side, all state transitions remain strictly enforced by Solidity modifier guards on-chain.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              onClick={() => navigate('/')}
              variant="secondary"
              size="md"
              className="flex-1"
            >
              Return to Public Portal
            </Button>

            {highestRole && (
              <Button
                onClick={() => navigate(highestDashboard.slice(1))}
                variant="primary"
                size="md"
                className="flex-1"
              >
                Go to My {ROLE_METADATA[highestRole]?.label} Dashboard
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
