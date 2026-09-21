import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRoles } from '../hooks/useRoles';
import { useRouter } from '../hooks/useRouter';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { shortenAddress, formatTimestamp } from '../utils/formatters';
import {
  fetchCitizenGrievances,
  STATUS_METADATA,
  PRIORITY_METADATA,
} from '../services/grievanceService';

export function CitizenDashboard() {
  const { address, networkName, chainId, provider, signer } = useWallet();
  const { isRegistered, registeredAt, registerCitizen, isLoading } = useRoles();
  const { navigate } = useRouter();

  const [notice, setNotice] = useState(null);
  const [submittingRegistration, setSubmittingRegistration] = useState(false);

  // My Grievances state
  const [myGrievances, setMyGrievances] = useState([]);
  const [loadingGrievances, setLoadingGrievances] = useState(false);

  const loadMyGrievances = useCallback(async () => {
    const runner = provider || signer;
    if (!runner || !address) {
      setMyGrievances([]);
      return;
    }

    setLoadingGrievances(true);
    try {
      const list = await fetchCitizenGrievances(runner, address);
      setMyGrievances(list);
    } catch (err) {
      console.warn('Could not load citizen grievances:', err);
    } finally {
      setLoadingGrievances(false);
    }
  }, [address, provider, signer]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (active) {
        await loadMyGrievances();
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [loadMyGrievances]);

  const handleSelfRegister = async () => {
    setSubmittingRegistration(true);
    setNotice(null);
    try {
      await registerCitizen();
      setNotice({
        type: 'success',
        title: 'Registration Successful',
        message: 'Your wallet has been self-registered as a Citizen on RoleManager.sol.',
      });
      loadMyGrievances();
    } catch (err) {
      setNotice({
        type: 'danger',
        title: 'Registration Failed',
        message: err.shortMessage || err.message || 'Transaction was rejected or failed.',
      });
    } finally {
      setSubmittingRegistration(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Registration / Action Notification */}
      {notice && (
        <Alert
          variant={notice.type}
          title={notice.title}
          onClose={() => setNotice(null)}
        >
          {notice.message}
        </Alert>
      )}

      {/* Profile Overview Card */}
      <Card className="bg-linear-to-r from-blue-900 to-slate-900 text-white border-0 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="primary" className="bg-blue-800/80 text-blue-200 border-blue-600">
                Citizen Portal
              </Badge>
              <span className="text-xs text-slate-300 font-mono">
                Chain ID: {chainId} ({networkName})
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Citizen Dashboard</h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Connected Account: <span className="font-mono font-semibold text-white">{address}</span>
            </p>
          </div>

          {/* Registration Status Badge */}
          <div className="flex flex-col sm:items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">On-Chain Status:</span>
              {isRegistered ? (
                <Badge variant="success" className="bg-emerald-950 text-emerald-300 border-emerald-700">
                  Registered Citizen
                </Badge>
              ) : (
                <Badge variant="warning" className="bg-amber-950 text-amber-300 border-amber-700">
                  Unregistered Wallet
                </Badge>
              )}
            </div>
            {registeredAt && (
              <span className="text-[11px] text-slate-400">
                Registered on-chain: {formatTimestamp(registeredAt)}
              </span>
            )}

            {!isRegistered && (
              <Button
                onClick={handleSelfRegister}
                loading={submittingRegistration || isLoading}
                variant="primary"
                size="sm"
                className="mt-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Self-Register as Citizen
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Have a Public Grievance?</h3>
          <p className="text-xs text-slate-500">
            Submit a case with verifiable IPFS description and evidence hashes on Ethereum.
          </p>
        </div>
        <Button
          onClick={() => navigate('/citizen/submit')}
          variant="primary"
          size="md"
          className="w-full sm:w-auto shadow-xs font-semibold"
        >
          + Submit New Grievance
        </Button>
      </div>

      {/* Grid: My Grievances & Track Grievance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Grievances List (2 columns) */}
        <div className="lg:col-span-2 space-y-4">
          <Card
            title={`My Submitted Grievances (${myGrievances.length})`}
            subtitle="Grievances registered by this wallet address directly on GrievanceSystem.sol"
          >
            {loadingGrievances ? (
              <div className="text-center py-8 text-xs text-slate-400 space-y-2">
                <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
                <span>Reading on-chain grievances...</span>
              </div>
            ) : myGrievances.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {myGrievances.map((g) => {
                  const statusMeta = STATUS_METADATA[g.status] || { label: 'Unknown', badgeVariant: 'default' };
                  const priorityMeta = PRIORITY_METADATA[g.priority] || { label: 'Unknown', badgeVariant: 'default' };

                  return (
                    <div
                      key={g.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 px-2 rounded-lg transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">
                            #{g.id}
                          </span>
                          <Badge variant={statusMeta.badgeVariant}>
                            {statusMeta.label}
                          </Badge>
                          <Badge variant={priorityMeta.badgeVariant}>
                            {priorityMeta.label}
                          </Badge>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-800 line-clamp-1">
                          {g.title}
                        </h4>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Submitted: {formatTimestamp(g.createdAt)} | Dept #{g.departmentId}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/citizen/grievance/${g.id}`)}
                        className="shrink-0 text-xs"
                      >
                        View Details →
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Empty State — Authenticity Principle */
              <div className="text-center py-12 px-4 space-y-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xl mx-auto">
                  📋
                </div>
                <h4 className="text-sm font-semibold text-slate-700">No Grievances Found</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  No active or historical grievances are currently associated with <span className="font-mono text-slate-700">{shortenAddress(address, 4)}</span> on the blockchain.
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => navigate('/citizen/submit')}
                  className="mt-2 text-xs"
                >
                  Create First Grievance
                </Button>
              </div>
            )}
          </Card>
        </div>


        {/* Verification & Status Sidebar (1 column) */}
        <div className="space-y-6">
          <Card
            title="Public Verification"
            subtitle="Direct on-chain state queries"
          >
            <div className="space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Any citizen can independently verify grievance lifecycles, officer assignments, and SLA deadlines directly against the contract.
              </p>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Query Target:</span>
                  <span className="font-mono text-slate-800">GrievanceSystem.sol</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Audit Proofs:</span>
                  <span className="font-mono text-slate-800">AuditTrail.sol</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Evidence Format:</span>
                  <span className="font-mono text-slate-800">IPFS CIDv1 (SHA-256)</span>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Grievance Lifecycle Guide">
            <ol className="text-xs space-y-2.5 text-slate-600 list-decimal list-inside leading-relaxed">
              <li><strong className="text-slate-800">Submitted:</strong> Citizen creates record on-chain.</li>
              <li><strong className="text-slate-800">Registered:</strong> Department Admin triages jurisdiction.</li>
              <li><strong className="text-slate-800">Assigned:</strong> Department Officer assigned.</li>
              <li><strong className="text-slate-800">Investigated:</strong> Officer submits resolution.</li>
              <li><strong className="text-slate-800">Closed:</strong> Citizen confirms satisfactory resolution.</li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
