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
  const [searchQuery, setSearchQuery] = useState('');

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
      setError('Unable to load current Sepolia blockchain state: ' + (err?.shortMessage || err?.message || 'Could not retrieve assigned cases from the smart contract.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isConnected, address, isSupportedNetwork, signer, provider]);

  // Immediate account-switching state clearance: zero stale data retention
  useEffect(() => {
    setCases([]);
    setDepartments([]);
    setCategories([]);
    setError(null);
  }, [address, chainId]);

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

  // Derived 7 KPI metrics per Section 1 specification
  const stats = useMemo(() => {
    const total = cases.length;
    const newReview = cases.filter(
      (c) => c.status === STATUSES.ASSIGNED || c.status === STATUSES.UNDER_REVIEW
    ).length;
    const investigating = cases.filter(
      (c) =>
        c.status === STATUSES.UNDER_INVESTIGATION ||
        c.status === STATUSES.ESCALATED
    ).length;
    const reopened = cases.filter(
      (c) => c.status === STATUSES.REOPENED
    ).length;
    const resolutionProposed = cases.filter(
      (c) =>
        c.status === STATUSES.RESOLUTION_PROPOSED ||
        c.status === STATUSES.CITIZEN_REVIEW
    ).length;
    const resolved = cases.filter(
      (c) => c.status === STATUSES.ACCEPTED || c.status === STATUSES.RESOLVED
    ).length;
    const closed = cases.filter((c) => c.status === STATUSES.CLOSED).length;
    const overdue = cases.filter(
      (c) =>
        c.slaDeadline > 0 &&
        currentTime > c.slaDeadline &&
        c.status !== STATUSES.CLOSED &&
        c.status !== STATUSES.ACCEPTED &&
        c.status !== STATUSES.RESOLVED &&
        c.status !== STATUSES.REJECTED
    ).length;

    return {
      total,
      newReview,
      investigating,
      reopened,
      resolutionProposed,
      resolved,
      closed,
      overdue,
    };
  }, [cases, currentTime]);

  // Filter cases across lifecycle statuses per Section 2
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (activeFilter === 'new_review') {
        if (c.status !== STATUSES.ASSIGNED && c.status !== STATUSES.UNDER_REVIEW) return false;
      } else if (activeFilter === 'investigating') {
        if (
          c.status !== STATUSES.UNDER_INVESTIGATION &&
          c.status !== STATUSES.ESCALATED
        ) return false;
      } else if (activeFilter === 'reopened') {
        if (c.status !== STATUSES.REOPENED) return false;
      } else if (activeFilter === 'resolution') {
        if (c.status !== STATUSES.RESOLUTION_PROPOSED && c.status !== STATUSES.CITIZEN_REVIEW) return false;
      } else if (activeFilter === 'resolved') {
        if (c.status !== STATUSES.ACCEPTED && c.status !== STATUSES.RESOLVED) return false;
      } else if (activeFilter === 'closed') {
        if (c.status !== STATUSES.CLOSED) return false;
      } else if (activeFilter === 'overdue') {
        const isOverdue =
          c.slaDeadline > 0 &&
          currentTime > c.slaDeadline &&
          c.status !== STATUSES.CLOSED &&
          c.status !== STATUSES.ACCEPTED &&
          c.status !== STATUSES.RESOLVED &&
          c.status !== STATUSES.REJECTED;
        if (!isOverdue) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = c.title.toLowerCase().includes(q);
        const matchesId = String(c.id).includes(q);
        return matchesTitle || matchesId;
      }

      return true;
    });
  }, [cases, activeFilter, searchQuery, currentTime]);

  if (!isSupportedNetwork && targetChainId) {
    return (
      <div className="max-w-5xl mx-auto py-8">
        <Alert variant="warning" title="Unsupported Network Detected">
          Your wallet is currently connected to an unsupported chain. Please switch to Ethereum Sepolia (Chain ID {targetChainId}) to access the Officer Console.
        </Alert>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="bg-white p-8 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl mx-auto">
            🛡️
          </div>
          <h2 className="text-xl font-bold text-slate-900">Wallet Connection Required</h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
            Please connect your designated field officer wallet to inspect and investigate assigned grievances on Ethereum Sepolia.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-fade-in">
      {/* Officer Identity & Top Banner */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="warning" dot className="font-bold text-xs uppercase">
                Officer Console
              </Badge>
              <span className="text-xs text-slate-400 font-mono">
                Ethereum Sepolia ({chainId})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Assigned Field Cases
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Field Officer:{' '}
              <span className="font-mono font-semibold text-slate-800">
                <span className="sm:hidden">{shortenAddress(address, 6)}</span>
                <span className="hidden sm:inline">{address}</span>
              </span>
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2.5 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadOfficerCases(true)}
              disabled={isLoading || isRefreshing}
              className="font-bold"
            >
              {isRefreshing ? 'Reading Chain...' : '↻ Refresh Cases'}
            </Button>
            <span className="text-[11px] text-slate-400">
              Direct smart contract state queries
            </span>
          </div>
        </div>

        {/* 8-Column Metric KPIs (Section 1) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-6 text-xs">
          <div
            onClick={() => setActiveFilter('all')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-blue-50/70 border-blue-200 ring-2 ring-blue-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium">Total Assigned</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {stats.total}
            </span>
          </div>

          <div
            onClick={() => setActiveFilter('new_review')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'new_review'
                ? 'bg-amber-50/70 border-amber-200 ring-2 ring-amber-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium">New / Review</span>
            <span className="text-xl font-extrabold text-amber-600 mt-1 block">
              {stats.newReview}
            </span>
          </div>

          <div
            onClick={() => setActiveFilter('investigating')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'investigating'
                ? 'bg-blue-50/70 border-blue-200 ring-2 ring-blue-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium">Investigating</span>
            <span className="text-xl font-extrabold text-blue-600 mt-1 block">
              {stats.investigating}
            </span>
          </div>

          <div
            onClick={() => setActiveFilter('reopened')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'reopened'
                ? 'bg-rose-50/70 border-rose-200 ring-2 ring-rose-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium">Reopened</span>
            <span className="text-xl font-extrabold text-rose-600 mt-1 block">
              {stats.reopened}
            </span>
          </div>

          <div
            onClick={() => setActiveFilter('resolution')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'resolution'
                ? 'bg-purple-50/80 border-purple-200 ring-2 ring-purple-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium">Resolution</span>
            <span className="text-xl font-extrabold text-purple-600 mt-1 block">
              {stats.resolutionProposed}
            </span>
          </div>

          <div
            onClick={() => setActiveFilter('resolved')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'resolved'
                ? 'bg-emerald-50/70 border-emerald-200 ring-2 ring-emerald-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium">Resolved</span>
            <span className="text-xl font-extrabold text-emerald-600 mt-1 block">
              {stats.resolved}
            </span>
          </div>

          <div
            onClick={() => setActiveFilter('closed')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'closed'
                ? 'bg-slate-200 border-slate-300 ring-2 ring-slate-200'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium">Closed</span>
            <span className="text-xl font-extrabold text-slate-700 mt-1 block">
              {stats.closed}
            </span>
          </div>

          <div
            onClick={() => setActiveFilter('overdue')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'overdue'
                ? 'bg-rose-50/80 border-rose-200 ring-2 ring-rose-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium">Overdue SLA</span>
            <span className={`text-xl font-extrabold mt-1 block ${stats.overdue > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {stats.overdue}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="danger" title="Error Loading Cases">
          {error}
        </Alert>
      )}

      {/* Case Management Table */}
      <Card
        title="Assigned Grievance Dossier"
        subtitle="Review assigned cases, record on-chain investigation notes, attach evidence, and propose remedies"
      >
        <div className="space-y-4">
          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              {[
                { id: 'all', label: `All (${stats.total})` },
                { id: 'new_review', label: `New / Review (${stats.newReview})` },
                { id: 'investigating', label: `Investigating (${stats.investigating})` },
                { id: 'resolution', label: `Resolution (${stats.resolutionProposed})` },
                { id: 'resolved', label: `Resolved (${stats.resolved})` },
                { id: 'closed', label: `Closed (${stats.closed})` },
                { id: 'overdue', label: `Overdue (${stats.overdue})` },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  type="button"
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-colors cursor-pointer ${
                    activeFilter === f.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Search by title or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none w-full sm:w-64"
            />
          </div>

          {/* Cases Table */}
          {isLoading ? (
            <div className="text-center py-12 text-xs text-slate-400 space-y-2">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
              <span>Loading assigned cases from Sepolia...</span>
            </div>
          ) : filteredCases.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">SLA Deadline</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCases.map((c) => {
                    const sMeta = STATUS_METADATA[c.status] || { label: 'Unknown', badgeVariant: 'default' };
                    const pMeta = PRIORITY_METADATA[c.priority] || { label: 'Medium', badgeVariant: 'default' };
                    const isConcluded = [STATUSES.CLOSED, STATUSES.ACCEPTED, STATUSES.RESOLVED].includes(c.status);
                    const isBreached =
                      c.slaDeadline > 0 &&
                      currentTime > c.slaDeadline &&
                      !isConcluded &&
                      c.status !== STATUSES.REJECTED;

                    let remainingStr = '';
                    if (c.slaDeadline > 0 && !isBreached && !isConcluded) {
                      const diff = c.slaDeadline - currentTime;
                      const hours = Math.floor(diff / 3600);
                      const days = Math.floor(hours / 24);
                      remainingStr = days > 0 ? `${days}d left` : `${hours}h left`;
                    }

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          #{c.id}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-xs truncate">
                          {c.title}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant={sMeta.badgeVariant} dot className="text-[10px]">
                            {sMeta.label}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant={pMeta.badgeVariant} className="text-[10px]">
                            {pMeta.label}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          {departmentMap[c.departmentId] || `Dept #${c.departmentId}`}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {categoryMap[c.categoryId] || (c.categoryId ? `Cat #${c.categoryId}` : 'General')}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          <div className="flex flex-col">
                            <span className={isBreached ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                              {formatTimestamp(c.slaDeadline)}
                            </span>
                            {isBreached && (
                              <span className="text-[10px] text-rose-600 font-bold">⚠️ Overdue</span>
                            )}
                            {remainingStr && (
                              <span className="text-[10px] text-slate-400">{remainingStr}</span>
                            )}
                            {c.status === STATUSES.ESCALATED && (
                              <span className="text-[10px] text-amber-600 font-bold">⚡ Escalated</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            size="xs"
                            variant="primary"
                            onClick={() => navigate(`/officer/grievance/${c.id}`)}
                            className="font-bold"
                          >
                            Manage Case →
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 px-4 space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xl mx-auto">
                🔎
              </div>
              <h4 className="text-sm font-bold text-slate-700">No Assigned Cases Found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                You currently have no cases assigned matching the filter. When department administrators assign grievances to your address, they will appear here.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
