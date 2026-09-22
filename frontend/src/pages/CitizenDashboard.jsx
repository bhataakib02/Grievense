import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  fetchActiveDepartments,
  fetchActiveCategories,
  STATUSES,
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
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingGrievances, setLoadingGrievances] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentTime] = useState(() => Math.floor(Date.now() / 1000));

  // Immediate account-switching state clearance: zero stale data retention
  useEffect(() => {
    setMyGrievances([]);
    setDepartments([]);
    setCategories([]);
    setNotice(null);
  }, [address, chainId]);

  const loadData = useCallback(async () => {
    const runner = provider || signer;
    if (!runner || !address) {
      setMyGrievances([]);
      return;
    }

    setLoadingGrievances(true);
    try {
      const [list, depts, cats] = await Promise.all([
        fetchCitizenGrievances(runner, address),
        fetchActiveDepartments(runner).catch(() => []),
        fetchActiveCategories(runner).catch(() => []),
      ]);
      setMyGrievances(list);
      setDepartments(depts);
      setCategories(cats);
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
        await loadData();
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [loadData]);

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
      loadData();
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

  // 9 KPI metrics per Section 9 specification
  const stats = useMemo(() => {
    const total = myGrievances.length;
    const pending = myGrievances.filter(
      (g) => g.status === STATUSES.SUBMITTED || g.status === STATUSES.REGISTERED
    ).length;
    const underReview = myGrievances.filter(
      (g) => g.status === STATUSES.ASSIGNED || g.status === STATUSES.UNDER_REVIEW
    ).length;
    const investigating = myGrievances.filter(
      (g) => g.status === STATUSES.UNDER_INVESTIGATION || g.status === STATUSES.ESCALATED
    ).length;
    const resolutionProposed = myGrievances.filter(
      (g) => g.status === STATUSES.RESOLUTION_PROPOSED || g.status === STATUSES.CITIZEN_REVIEW
    ).length;
    const resolved = myGrievances.filter(
      (g) => g.status === STATUSES.ACCEPTED || g.status === STATUSES.RESOLVED
    ).length;
    const rejected = myGrievances.filter((g) => g.status === STATUSES.REJECTED).length;
    const reopened = myGrievances.filter((g) => g.status === STATUSES.REOPENED).length;
    const closed = myGrievances.filter((g) => g.status === STATUSES.CLOSED).length;

    return {
      total,
      pending,
      underReview,
      investigating,
      resolutionProposed,
      resolved,
      rejected,
      reopened,
      closed,
    };
  }, [myGrievances]);

  // Filtered grievances
  const filteredGrievances = useMemo(() => {
    return myGrievances.filter((g) => {
      if (statusFilter === 'pending') {
        if (g.status !== STATUSES.SUBMITTED && g.status !== STATUSES.REGISTERED) return false;
      } else if (statusFilter === 'under_review') {
        if (g.status !== STATUSES.ASSIGNED && g.status !== STATUSES.UNDER_REVIEW) return false;
      } else if (statusFilter === 'investigating') {
        if (g.status !== STATUSES.UNDER_INVESTIGATION && g.status !== STATUSES.ESCALATED) return false;
      } else if (statusFilter === 'resolution_proposed') {
        if (g.status !== STATUSES.RESOLUTION_PROPOSED && g.status !== STATUSES.CITIZEN_REVIEW) return false;
      } else if (statusFilter === 'resolved') {
        if (g.status !== STATUSES.ACCEPTED && g.status !== STATUSES.RESOLVED) return false;
      } else if (statusFilter === 'rejected') {
        if (g.status !== STATUSES.REJECTED) return false;
      } else if (statusFilter === 'reopened') {
        if (g.status !== STATUSES.REOPENED) return false;
      } else if (statusFilter === 'closed') {
        if (g.status !== STATUSES.CLOSED) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = g.title.toLowerCase().includes(q);
        const matchesId = String(g.id).includes(q);
        return matchesTitle || matchesId;
      }

      return true;
    });
  }, [myGrievances, statusFilter, searchQuery]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-fade-in">
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

      {/* Unregistered Alert Banner */}
      {!isRegistered && (
        <div className="p-5 bg-amber-50 border border-amber-200 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">ℹ️</span>
            <div>
              <h3 className="text-sm font-bold text-amber-950">
                Citizen Self-Registration Required
              </h3>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                Self-register your wallet on-chain to submit new grievances with cryptographic proof of ownership.
              </p>
            </div>
          </div>
          <Button
            onClick={handleSelfRegister}
            loading={submittingRegistration || isLoading}
            variant="primary"
            size="sm"
            className="shrink-0 font-bold"
          >
            Self-Register as Citizen
          </Button>
        </div>
      )}

      {/* Profile Overview Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="primary" dot className="font-bold text-xs uppercase">
                Citizen Portal
              </Badge>
              <span className="text-xs text-slate-400 font-mono">
                Ethereum Sepolia ({chainId})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              My Public Grievances
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Connected Account:{' '}
              <span className="font-mono font-semibold text-slate-800">{address}</span>
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">On-Chain Status:</span>
              {isRegistered ? (
                <Badge variant="success" dot className="font-bold text-[11px]">
                  Registered Citizen
                </Badge>
              ) : (
                <Badge variant="warning" className="font-bold text-[11px]">
                  Unregistered Wallet
                </Badge>
              )}
            </div>
            {registeredAt && (
              <span className="text-[11px] text-slate-400 font-mono">
                Registered: {formatTimestamp(registeredAt)}
              </span>
            )}
            <Button
              onClick={() => navigate('/citizen/submit')}
              variant="primary"
              size="sm"
              className="mt-1 font-bold shadow-xs"
            >
              + Submit New Grievance
            </Button>
          </div>
        </div>

        {/* 9 Metric Cards (Section 9) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2 pt-6 text-xs">
          <div
            onClick={() => setStatusFilter('all')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-blue-50/70 border-blue-200 ring-2 ring-blue-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium truncate">Total</span>
            <span className="text-lg font-extrabold text-slate-900 mt-1 block">
              {stats.total}
            </span>
          </div>

          <div
            onClick={() => setStatusFilter('pending')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-amber-50/70 border-amber-200 ring-2 ring-amber-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium truncate">Pending</span>
            <span className="text-lg font-extrabold text-amber-600 mt-1 block">
              {stats.pending}
            </span>
          </div>

          <div
            onClick={() => setStatusFilter('under_review')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'under_review'
                ? 'bg-amber-50/70 border-amber-200 ring-2 ring-amber-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium truncate">Review</span>
            <span className="text-lg font-extrabold text-amber-700 mt-1 block">
              {stats.underReview}
            </span>
          </div>

          <div
            onClick={() => setStatusFilter('investigating')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'investigating'
                ? 'bg-blue-50/70 border-blue-200 ring-2 ring-blue-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium truncate">Investigating</span>
            <span className="text-lg font-extrabold text-blue-600 mt-1 block">
              {stats.investigating}
            </span>
          </div>

          <div
            onClick={() => setStatusFilter('resolution_proposed')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'resolution_proposed'
                ? 'bg-purple-50/80 border-purple-200 ring-2 ring-purple-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium truncate">Resolution</span>
            <span className="text-lg font-extrabold text-purple-600 mt-1 block">
              {stats.resolutionProposed}
            </span>
          </div>

          <div
            onClick={() => setStatusFilter('resolved')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'resolved'
                ? 'bg-emerald-50/70 border-emerald-200 ring-2 ring-emerald-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium truncate">Resolved</span>
            <span className="text-lg font-extrabold text-emerald-600 mt-1 block">
              {stats.resolved}
            </span>
          </div>

          <div
            onClick={() => setStatusFilter('rejected')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'rejected'
                ? 'bg-rose-50/80 border-rose-200 ring-2 ring-rose-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium truncate">Rejected</span>
            <span className="text-lg font-extrabold text-rose-600 mt-1 block">
              {stats.rejected}
            </span>
          </div>

          <div
            onClick={() => setStatusFilter('reopened')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'reopened'
                ? 'bg-orange-50/80 border-orange-200 ring-2 ring-orange-100'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium truncate">Reopened</span>
            <span className="text-lg font-extrabold text-orange-600 mt-1 block">
              {stats.reopened}
            </span>
          </div>

          <div
            onClick={() => setStatusFilter('closed')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'closed'
                ? 'bg-slate-200 border-slate-300 ring-2 ring-slate-200'
                : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60'
            }`}
          >
            <span className="text-slate-500 block font-medium truncate">Closed</span>
            <span className="text-lg font-extrabold text-slate-700 mt-1 block">
              {stats.closed}
            </span>
          </div>
        </div>
      </div>

      {/* Cases Table Section (Section 10) */}
      <Card
        title="My Grievance Tracking Records"
        subtitle="Historical and active grievances submitted by this connected wallet"
      >
        <div className="space-y-4">
          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: `All (${stats.total})` },
                { id: 'pending', label: `Pending (${stats.pending})` },
                { id: 'under_review', label: `Review (${stats.underReview})` },
                { id: 'investigating', label: `Investigating (${stats.investigating})` },
                { id: 'resolution_proposed', label: `Resolution (${stats.resolutionProposed})` },
                { id: 'resolved', label: `Resolved (${stats.resolved})` },
                { id: 'rejected', label: `Rejected (${stats.rejected})` },
                { id: 'reopened', label: `Reopened (${stats.reopened})` },
                { id: 'closed', label: `Closed (${stats.closed})` },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  type="button"
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-colors cursor-pointer ${
                    statusFilter === f.id
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

          {/* Grievance Table */}
          {loadingGrievances ? (
            <div className="text-center py-12 text-xs text-slate-400 space-y-2">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
              <span>Reading on-chain grievances from Sepolia...</span>
            </div>
          ) : filteredGrievances.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4">SLA</th>
                    <th className="py-3 px-4">Last Update</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGrievances.map((g) => {
                    const sMeta = STATUS_METADATA[g.status] || { label: 'Unknown', badgeVariant: 'default' };
                    const pMeta = PRIORITY_METADATA[g.priority] || { label: 'Medium', badgeVariant: 'default' };
                    const isConcluded = [STATUSES.CLOSED, STATUSES.ACCEPTED, STATUSES.RESOLVED].includes(g.status);
                    const isBreached =
                      g.slaDeadline > 0 &&
                      currentTime > g.slaDeadline &&
                      !isConcluded &&
                      g.status !== STATUSES.REJECTED;
                    const isAwaitingAction =
                      g.status === STATUSES.RESOLUTION_PROPOSED || g.status === STATUSES.CITIZEN_REVIEW;

                    return (
                      <tr key={g.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          #{g.id}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-xs truncate">
                          {g.title}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          {departmentMap[g.departmentId] || `Dept #${g.departmentId}`}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {categoryMap[g.categoryId] || (g.categoryId ? `Cat #${g.categoryId}` : 'General')}
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
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                          {formatTimestamp(g.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          <span className={isBreached ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                            {formatTimestamp(g.slaDeadline)}
                          </span>
                          {isBreached && (
                            <span className="text-[10px] text-rose-600 font-bold block">⚠️ Breached</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                          {formatTimestamp(g.updatedAt)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            size="xs"
                            variant={isAwaitingAction ? 'warning' : 'primary'}
                            onClick={() => navigate(`/citizen/grievance/${g.id}`)}
                            className="font-bold"
                          >
                            {isAwaitingAction ? 'Review Resolution →' : 'View Case →'}
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
                📋
              </div>
              <h4 className="text-sm font-bold text-slate-700">No Grievances Found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                No grievances matched the current filter. Create a new grievance to initiate a tamper-proof on-chain record.
              </p>
              <Button
                size="sm"
                variant="primary"
                onClick={() => navigate('/citizen/submit')}
                className="mt-2 text-xs font-bold"
              >
                + Create New Grievance
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
