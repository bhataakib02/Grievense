import React from 'react';
import { useWallet } from '../../hooks/useWallet';
import { useRoles } from '../../hooks/useRoles';
import { UnauthorizedPage } from '../../pages/UnauthorizedPage';
import { Button } from '../common/Button';
import { Card } from '../common/Card';

export function ProtectedRoute({ allowedRoles, children }) {
  const { isConnected, connectWallet, isConnecting } = useWallet();
  const { activeRoles, isLoading } = useRoles();


  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <Card title="Authentication Required">
          <div className="py-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl mx-auto">
              🔒
            </div>
            <p className="text-sm text-slate-600">
              Please connect your Web3 wallet to access this portal section. Authorization will be verified directly against the on-chain RoleManager contract.
            </p>
            <Button
              onClick={connectWallet}
              loading={isConnecting}
              variant="primary"
              size="md"
              className="w-full"
            >
              Connect Wallet
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <Card>
          <div className="py-8 space-y-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm font-medium text-slate-700">Verifying on-chain permissions...</p>
            <p className="text-xs text-slate-400 font-mono">Querying RoleManager.sol</p>
          </div>
        </Card>
      </div>
    );
  }

  // Check if wallet holds at least one of the allowed roles
  const hasPermission = allowedRoles.some((role) => activeRoles.includes(role));

  if (!hasPermission) {
    return (
      <UnauthorizedPage
        requiredRoles={allowedRoles}
        userRoles={activeRoles}
      />
    );
  }

  return children;
}
