import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRoles } from '../hooks/useRoles';
import { useRouter } from '../hooks/useRouter';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { formatTimestamp, shortenAddress } from '../utils/formatters';
import {
  fetchOfficerGrievances,
  fetchActiveDepartments,
  fetchActiveCategories,
  STATUS_METADATA,
  PRIORITY_METADATA,
  STATUSES,
} from '../services/grievanceService';

export function OfficerDashboard() {
  const { address, provider, signer, networkName, chainId, isConnected } = useWallet();
  const { isSupportedNetwork, targetChainId } = useRoles();
  const { navigate } = useRouter();

  const [cases, setCases] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000));
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  // Load officer assigned cases and entity metadata directly from smart contracts
  const loadOfficerCases = useCallback(async (isManualRefresh = false) => {
    setCurrentTime(Math.floor(Date.now() / 1000));
    if (!isConnected || !address) {
      setCases([]);
      setIsLoading(false);
      return;
    }

    if (!isSupportedNetwork) {
      setCases([]);
      setIsLoading(false);
      return;
    }

    const runner = signer || provider;
    if (!runner) {
      setIsLoading(false);
      return;
    }

    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Query departments and categories for human-readable labels
      const [assignedCases, activeDepts, activeCats] = await Promise.all([
        fetchOfficerGrievances(runner, address),
        fetchActiveDepartments(runner).catch(() => []),
        fetchActiveCategories(runner).catch(() => []),
      ]);

      setCases(assignedCases);
      setDepartments(activeDepts);
      setCategories(activeCats);
    } catch (err) {
      console.error('Failed to load officer cases from smart contract:', err);
      setError(err?.message || 'Could not retrieve assigned cases from the smart contract.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isConnected, address, isSupportedNetwork, signer, provider]);

  useEffect(() => {
    let active = true;
    const fetchCases = async () => {
      if (active) {
        await loadOfficerCases(false);
      }
    };
    fetchCases();
    return () => {
      active = false;
    };
  }, [loadOfficerCases]);

  // Map department & category IDs to names
  const departmentMap = useMemo(() => {
    const map = {};
    departments.forEach((d) => {
      map[d.id] = d.name;
    });
    return map;
  }, [departments]);

  const categoryMap = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [categories]);

  // Derived KPI metrics (calculated STRICTLY from real on-chain retrieved cases)
  const stats = useMemo(() => {
    const total = cases.length;
    const underReview = cases.filter((c) => c.status === STATUSES.UNDER_REVIEW).length;
    const underInvestigation = cases.filter((c) => c.status === STATUSES.UNDER_INVESTIGATION).length;
    const resolutionProposed = cases.filter((c) => c.status === STATUSES.RESOLUTION_PROPOSED).length;
    const citizenReview = cases.filter((c) => c.status === STATUSES.CITIZEN_REVIEW).length;
    const overdue = cases.filter(
      (c) =>
        c.slaDeadline > 0 &&
        currentTime > c.slaDeadline &&
        c.status !== STATUSES.CLOSED &&
        c.status !== STATUSES.ACCEPTED
    ).length;

    return {
      total,
      underReview,
      underInvestigation,
      resolutionProposed,
      citizenReview,
      overdue,
    };
  }, [cases, currentTime]);

  // Filter cases for the list
  const filteredCases = useMemo(() => {
    switch (activeFilter) {
      case 'assigned':
        return cases.filter(
          (c) => c.status === STATUSES.ASSIGNED || c.status === STATUSES.UNDER_REVIEW
        );
      case 'investigating':
        return cases.filter((c) => c.status === STATUSES.UNDER_INVESTIGATION);
      case 'resolution':
        return cases.filter(
          (c) =>
            c.status === STATUSES.RESOLUTION_PROPOSED || c.status === STATUSES.CITIZEN_REVIEW
        );
      case 'closed':
        return cases.filter(
          (c) => c.status === STATUSES.ACCEPTED || c.status === STATUSES.CLOSED
        );
      case 'overdue':
        return cases.filter((c) => {
          return (
            c.slaDeadline > 0 &&
            currentTime > c.slaDeadline &&
            c.status !== STATUSES.CLOSED &&
            c.status !== STATUSES.ACCEPTED
          );
        });
      case 'all':
      default:
        return cases;
    }
  }, [cases, activeFilter, currentTime]);

  // Unsupported Network State
  if (!isSupportedNetwork && targetChainId) {
    return (
      <div className="max-w-5xl mx-auto py-8">
        <Alert variant="warning" title="Unsupported Network Detected">
          Your wallet is currently connected to an unsupported chain. Please switch to Chain ID {targetChainId} ({networkName}) to access the Officer Console.
        </Alert>
      </div>
    );
  }

  // Wallet Disconnected State
  if (!isConnected || !address) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center space-y-4">
        <Card className="max-w-lg mx-auto py-10 px-6">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xl mx-auto mb-3">
            🛡️
          </div>
          <h3 className="text-base font-bold text-slate-900">Wallet Connection Required</h3>
          <p className="text-xs text-slate-600 mb-4">
            Please connect your designated officer wallet to load your assigned case dossier from the blockchain.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Officer Identity & Control Bar */}
      <Card className="bg-slate-900 text-white border-0 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="warning" className="bg-amber-500/20 text-amber-300 border-amber-500/40">
                Officer Workspace
              </Badge>
              <span className="text-xs text-slate-300 font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                {networkName} (Chain ID: {chainId})
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Officer Dashboard</h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Connected Officer:{' '}
              <span className="font-mono font-semibold text-white break-all" title={address}>
                {address}
              </span>
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2.5">
            <div className="flex items-center gap-2">
              <Badge variant="warning" className="text-xs font-semibold">
                Role: OFFICER_ROLE
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadOfficerCases(true)}
                disabled={isLoading || isRefreshing}
                className="text-xs bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
              >
                {isRefreshing ? 'Reading Chain...' : '↻ Refresh Cases'}
              </Button>
            </div>
            <span className="text-[11px] text-slate-400">
              Authoritative on-chain case management and investigations
            </span>
          </div>
        </div>
      </Card>

      {/* SLA & Investigation Protocol Notice */}
      <Alert variant="info" title="Deterministic SLA Enforcement Protocol">
        Assigned grievances carry deterministic SLA targets enforced on-chain. If an investigation breaches its target deadline without a recorded resolution, the grievance becomes eligible for escalation in accordance with Department governance rules.
      </Alert>

      {/* Case Summary KPIs (Derived from real contract records only) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Assigned</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
        </div>
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Under Review</div>
          <div className="text-xl sm:text-2xl font-bold text-amber-700 mt-1">{stats.underReview}</div>
        </div>
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Investigating</div>
          <div className="text-xl sm:text-2xl font-bold text-blue-700 mt-1">{stats.underInvestigation}</div>
        </div>
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Proposed</div>
          <div className="text-xl sm:text-2xl font-bold text-indigo-700 mt-1">{stats.resolutionProposed}</div>
        </div>
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Citizen Review</div>
          <div className="text-xl sm:text-2xl font-bold text-purple-700 mt-1">{stats.citizenReview}</div>
        </div>
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Overdue SLA</div>
          <div className={`text-xl sm:text-2xl font-bold mt-1 ${stats.overdue > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
            {stats.overdue}
          </div>
        </div>
      </div>

      {/* Case Management Workspace */}
      <div className="space-y-4">
        {/* Filters and Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Assigned Case Dossier</h2>
            <Badge variant="neutral" className="text-xs font-mono font-semibold">
              {filteredCases.length} {filteredCases.length === 1 ? 'case' : 'cases'}
            </Badge>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center flex-wrap gap-1.5">
            {[
              { key: 'all', label: 'All Cases', count: stats.total },
              { key: 'assigned', label: 'Pending / Review', count: stats.underReview },
              { key: 'investigating', label: 'Under Investigation', count: stats.underInvestigation },
              { key: 'resolution', label: 'In Resolution', count: stats.resolutionProposed + stats.citizenReview },
              { key: 'overdue', label: 'Overdue SLA', count: stats.overdue },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveFilter(tab.key)}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === tab.key
                    ? 'bg-slate-900 text-white font-semibold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeFilter === tab.key ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Query Error State */}
        {error && (
          <Alert variant="danger" title="Smart Contract Read Failure">
            <div className="space-y-2">
              <p>{error}</p>
              <Button variant="secondary" size="sm" onClick={() => loadOfficerCases(true)}>
                Retry On-Chain Query
              </Button>
            </div>
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && (
          <Card>
            <div className="text-center py-16 px-4 space-y-3">
              <div className="animate-spin w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full mx-auto" />
              <p className="text-sm font-semibold text-slate-700">
                Querying assigned grievances directly from smart contract...
              </p>
              <p className="text-xs text-slate-400 font-mono">
                Executing getGrievanceCount() & isAssignedOfficer() on GrievanceSystem.sol
              </p>
            </div>
          </Card>
        )}

        {/* Empty State (Authentic On-Chain Zero State) */}
        {!isLoading && !error && filteredCases.length === 0 && (
          <Card>
            <div className="text-center py-16 px-4 space-y-3 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xl mx-auto">
                📋
              </div>
              <h3 className="text-sm font-semibold text-slate-800">
                {cases.length === 0 ? 'No Grievances Assigned' : 'No Cases Match Filter'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {cases.length === 0 ? (
                  <>
                    There are currently no grievances assigned to officer{' '}
                    <span className="font-mono text-slate-700 font-semibold">{shortenAddress(address, 4)}</span> in{' '}
                    <code className="font-mono text-[11px] bg-slate-200 px-1 py-0.5 rounded">GrievanceSystem.sol</code>.
                    Cases assigned by Department Administrators will appear here automatically.
                  </>
                ) : (
                  'No assigned cases match the selected status filter.'
                )}
              </p>
              {cases.length > 0 && activeFilter !== 'all' && (
                <Button variant="secondary" size="sm" onClick={() => setActiveFilter('all')} className="mt-2 text-xs">
                  Show All Assigned Cases
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Case List Display */}
        {!isLoading && !error && filteredCases.length > 0 && (
          <div className="space-y-3">
            {filteredCases.map((item) => {
              const statusMeta = STATUS_METADATA[item.status] || {
                label: 'Unknown',
                badgeVariant: 'default',
              };
              const priorityMeta = PRIORITY_METADATA[item.priority] || {
                label: 'Standard',
                badgeVariant: 'default',
              };
              const isOverdue =
                item.slaDeadline > 0 &&
                currentTime > item.slaDeadline &&
                item.status !== STATUSES.CLOSED &&
                item.status !== STATUSES.ACCEPTED;

              const departmentName = departmentMap[item.departmentId] || `Dept #${item.departmentId}`;
              const categoryName = categoryMap[item.categoryId] || `Category #${item.categoryId}`;

              return (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="neutral" className="font-mono font-bold text-xs">
                        #{item.id}
                      </Badge>
                      <Badge variant={statusMeta.badgeVariant} className="text-xs">
                        {statusMeta.label}
                      </Badge>
                      <Badge variant={priorityMeta.badgeVariant} className="text-xs">
                        {priorityMeta.label} Priority
                      </Badge>
                      {isOverdue && (
                        <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded flex items-center gap-1">
                          ⚠️ SLA Breached
                        </span>
                      )}
                      {item.reopenCount > 0 && (
                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                          Reopened ({item.reopenCount})
                        </span>
                      )}
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/officer/grievance/${item.id}`)}
                      className="text-xs self-start sm:self-auto font-semibold"
                    >
                      View Case Details →
                    </Button>
                  </div>

                  <div>
                    <h3
                      onClick={() => navigate(`/officer/grievance/${item.id}`)}
                      className="text-base font-bold text-slate-900 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      {item.title}
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-2 border-t border-slate-100 text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Department</span>
                      <span className="font-medium text-slate-800 truncate block" title={departmentName}>
                        {departmentName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Category</span>
                      <span className="font-medium text-slate-800 truncate block" title={categoryName}>
                        {categoryName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Citizen</span>
                      <span className="font-mono text-slate-800 truncate block" title={item.citizen}>
                        {shortenAddress(item.citizen, 4)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">SLA Deadline</span>
                      <span className={`font-mono block truncate ${isOverdue ? 'text-rose-600 font-bold' : 'text-slate-800'}`}>
                        {formatTimestamp(item.slaDeadline)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400 border-t border-slate-50">
                    <div>
                      Created: {formatTimestamp(item.createdAt)} | Updated: {formatTimestamp(item.updatedAt)}
                    </div>
                    <div>
                      Resolution ID: {item.currentResolutionId > 0 ? `#${item.currentResolutionId}` : 'None pending'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Protocol & Verification Reference Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Investigation Protocol">
          <ul className="text-xs space-y-2 text-slate-600 list-disc list-inside leading-relaxed">
            <li>Review the citizen's initial claim and inspect verified IPFS commitments.</li>
            <li>Initiate formal review on-chain when starting active evaluation.</li>
            <li>Conduct field inspections and append cryptographic investigation notes.</li>
            <li>Submit immutable resolutions with dual-reference verification (CID + Keccak-256).</li>
            <li>Track SLA deadlines to ensure compliance before automated escalation thresholds.</li>
          </ul>
        </Card>

        <Card title="Evidence & IPFS Standards">
          <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
            <p>
              Evidence artifacts submitted by officers are pinned to decentralized storage with a SHA-256 hash committed directly to the smart contract:
            </p>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700 space-y-1">
              <div>Content Addressing: IPFS CIDv1 (base32)</div>
              <div>Digest Commitment: bytes32 SHA-256</div>
              <div>Audit Action: EVIDENCE_ADDED / INVESTIGATION_NOTE</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
