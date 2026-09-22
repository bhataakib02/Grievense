import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRouter } from '../hooks/useRouter';
import { useRoles } from '../hooks/useRoles';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { formatTimestamp, shortenAddress, getExplorerAddressUrl } from '../utils/formatters';
import {
  STATUSES,
  STATUS_METADATA,
  PRIORITY_METADATA,
  fetchGrievancesByDepartment,
  registerGrievance,
  assignOfficer,
  reassignOfficer,
  rejectGrievance,
} from '../services/grievanceService';
import {
  fetchAllDepartments,
  fetchDepartmentOfficers,
  addOfficerToDepartment,
  removeOfficerFromDepartment,
  transferOfficerDepartment,
} from '../services/departmentService';
import { grantOfficerRole } from '../services/adminRoleService';
import { fetchUserRoles } from '../services/roleService';
import {
  escalateGrievance,
  resolveEscalation,
} from '../services/escalationService';

export function DepartmentAdminDashboard() {
  const { address, signer, provider, chainId } = useWallet();
  const { currentRole, ROLES } = useRoles();
  const { navigate } = useRouter();

  const [activeSection, setActiveSection] = useState('triage');
  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [deptOfficers, setDeptOfficers] = useState([]);
  const [deptGrievances, setDeptGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [currentTime] = useState(() => Math.floor(Date.now() / 1000));

  // Action loading indicator
  const [actionLoading, setActionLoading] = useState('');

  // Triage assign modal state
  const [assignTargetGrievance, setAssignTargetGrievance] = useState(null);
  const [selectedOfficerForAssign, setSelectedOfficerForAssign] = useState('');

  // Rejection modal state
  const [rejectTargetGrievance, setRejectTargetGrievance] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Reassign modal state
  const [reassignTarget, setReassignTarget] = useState(null);
  const [newOfficerForReassign, setNewOfficerForReassign] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  // Officer add state
  const [showAddOfficerModal, setShowAddOfficerModal] = useState(false);
  const [newOfficerAddress, setNewOfficerAddress] = useState('');

  // Officer remove confirm dialog state
  const [confirmRemoveOfficer, setConfirmRemoveOfficer] = useState(null); // officer address

  // Officer transfer state
  const [transferTargetOfficer, setTransferTargetOfficer] = useState('');
  const [transferTargetDeptId, setTransferTargetDeptId] = useState('');

  const runner = provider || signer;

  // 1. Load departments managed by this admin
  const loadDepartments = useCallback(async () => {
    if (!runner) return;
    try {
      setLoading(true);
      setError(null);
      const all = await fetchAllDepartments(runner);

      let adminDepts = all;
      if (currentRole !== ROLES.SUPER_ADMIN && address) {
        adminDepts = all.filter(
          (d) => d.admin && d.admin.toLowerCase() === address.toLowerCase()
        );
      }

      setDepartments(adminDepts);
      if (adminDepts.length > 0 && !selectedDeptId) {
        setSelectedDeptId(adminDepts[0].id);
      }
    } catch (err) {
      console.error('Failed to load departments:', err);
      setError('Could not load department list from blockchain.');
    } finally {
      setLoading(false);
    }
  }, [runner, address, currentRole, ROLES.SUPER_ADMIN, selectedDeptId]);

  useEffect(() => {
    let active = true;
    const fetchDepts = async () => {
      if (active) await loadDepartments();
    };
    fetchDepts();
    return () => {
      active = false;
    };
  }, [loadDepartments]);

  // 2. Load selected department data (officers & grievances)
  const loadDeptData = useCallback(async () => {
    if (!selectedDeptId || !runner) return;
    try {
      setLoading(true);
      const [officers, grievances] = await Promise.all([
        fetchDepartmentOfficers(runner, selectedDeptId),
        fetchGrievancesByDepartment(runner, selectedDeptId),
      ]);
      setDeptOfficers(officers);
      setDeptGrievances(grievances);
    } catch (err) {
      console.error('Failed to load department details:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDeptId, runner]);

  useEffect(() => {
    let active = true;
    const fetchDeptDetails = async () => {
      if (active) await loadDeptData();
    };
    fetchDeptDetails();
    return () => {
      active = false;
    };
  }, [loadDeptData]);

  // Register intake (SUBMITTED -> REGISTERED)
  const handleRegisterGrievance = async (grievanceId) => {
    try {
      setActionLoading(`reg_${grievanceId}`);
      setError(null);
      setSuccessMsg('');
      await registerGrievance(signer, grievanceId);
      setSuccessMsg(`Grievance #${grievanceId} formally registered on-chain.`);
      await loadDeptData();
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setActionLoading('');
    }
  };

  // Assign Officer
  const handleAssignOfficer = async (e) => {
    e.preventDefault();
    if (!assignTargetGrievance || !selectedOfficerForAssign) {
      setError('Please select an officer from the department roster.');
      return;
    }
    try {
      setActionLoading('assign');
      setError(null);
      setSuccessMsg('');
      await assignOfficer(signer, assignTargetGrievance.id, selectedOfficerForAssign);
      setSuccessMsg(`Grievance #${assignTargetGrievance.id} assigned to officer successfully.`);
      setAssignTargetGrievance(null);
      setSelectedOfficerForAssign('');
      await loadDeptData();
    } catch (err) {
      setError(err.message || 'Assignment failed.');
    } finally {
      setActionLoading('');
    }
  };

  // Reassign Officer
  const handleReassignOfficer = async (e) => {
    e.preventDefault();
    if (!reassignTarget || !newOfficerForReassign) {
      setError('Please select a new officer.');
      return;
    }
    if (!reassignReason.trim()) {
      setError('Reassignment reason is required.');
      return;
    }
    try {
      setActionLoading('reassign');
      setError(null);
      setSuccessMsg('');
      await reassignOfficer(signer, reassignTarget.id, newOfficerForReassign, reassignReason.trim());
      setSuccessMsg(`Grievance #${reassignTarget.id} reassigned successfully.`);
      setReassignTarget(null);
      setNewOfficerForReassign('');
      setReassignReason('');
      await loadDeptData();
    } catch (err) {
      setError(err.message || 'Reassignment failed.');
    } finally {
      setActionLoading('');
    }
  };

  // Enroll / Add Officer to Department
  const handleAddOfficer = async (e) => {
    e.preventDefault();
    if (!newOfficerAddress || !selectedDeptId) {
      setError('Officer wallet address is required.');
      return;
    }
    try {
      setActionLoading('add_officer');
      setError(null);
      setSuccessMsg('');

      const roles = await fetchUserRoles(runner, newOfficerAddress.trim());
      if (!roles.isOfficer) {
        await grantOfficerRole(signer, newOfficerAddress.trim());
      }

      await addOfficerToDepartment(signer, selectedDeptId, newOfficerAddress.trim());

      setSuccessMsg(`Officer ${shortenAddress(newOfficerAddress.trim(), 6)} added to department roster.`);
      setNewOfficerAddress('');
      setShowAddOfficerModal(false);
      await loadDeptData();
    } catch (err) {
      setError(err.message || 'Failed to add officer to department.');
    } finally {
      setActionLoading('');
    }
  };

  // Remove Officer from Department
  const executeRemoveOfficer = async () => {
    if (!confirmRemoveOfficer) return;
    try {
      setActionLoading(`remove_${confirmRemoveOfficer}`);
      setError(null);
      setSuccessMsg('');
      await removeOfficerFromDepartment(signer, selectedDeptId, confirmRemoveOfficer);
      setSuccessMsg(`Officer ${shortenAddress(confirmRemoveOfficer, 6)} removed from department.`);
      setConfirmRemoveOfficer(null);
      await loadDeptData();
    } catch (err) {
      setError(err.message || 'Failed to remove officer.');
    } finally {
      setActionLoading('');
    }
  };

  // Trigger Escalation
  const handleTriggerEscalate = async (grievanceId) => {
    try {
      setActionLoading(`esc_${grievanceId}`);
      setError(null);
      setSuccessMsg('');
      await escalateGrievance(signer, grievanceId);
      setSuccessMsg(`Grievance #${grievanceId} escalated due to SLA breach.`);
      await loadDeptData();
    } catch (err) {
      setError(err.message || 'Escalation failed.');
    } finally {
      setActionLoading('');
    }
  };

  // Resolve Escalation
  const handleResolveEscalate = async (grievanceId) => {
    try {
      setActionLoading(`res_esc_${grievanceId}`);
      setError(null);
      setSuccessMsg('');
      await resolveEscalation(signer, grievanceId);
      setSuccessMsg(`Escalation resolved for Grievance #${grievanceId}. Returned to investigation.`);
      await loadDeptData();
    } catch (err) {
      setError(err.message || 'Resolving escalation failed.');
    } finally {
      setActionLoading('');
    }
  };

  // Reject Grievance (Administrative Rejection)
  const handleRejectGrievance = async (e) => {
    e?.preventDefault();
    if (!rejectTargetGrievance) return;
    try {
      setActionLoading(`reject_${rejectTargetGrievance.id}`);
      setError(null);
      setSuccessMsg('');
      await rejectGrievance(signer, rejectTargetGrievance.id, rejectReason.trim() || 'Rejected by Department Admin');
      setSuccessMsg(`Grievance #${rejectTargetGrievance.id} administratively rejected.`);
      setRejectTargetGrievance(null);
      setRejectReason('');
      await loadDeptData();
    } catch (err) {
      setError(err.message || 'Failed to reject grievance.');
    } finally {
      setActionLoading('');
    }
  };

  // Transfer Officer to Another Department
  const handleTransferOfficer = async (e) => {
    e?.preventDefault();
    if (!transferTargetOfficer || !transferTargetDeptId) return;
    try {
      setActionLoading(`transfer_${transferTargetOfficer}`);
      setError(null);
      setSuccessMsg('');
      await transferOfficerDepartment(
        signer,
        transferTargetOfficer,
        selectedDeptId,
        Number(transferTargetDeptId)
      );
      setSuccessMsg(`Officer ${shortenAddress(transferTargetOfficer, 6)} successfully transferred to Department #${transferTargetDeptId}.`);
      setTransferTargetOfficer('');
      setTransferTargetDeptId('');
      await loadDeptData();
    } catch (err) {
      setError(err.message || 'Officer transfer failed.');
    } finally {
      setActionLoading('');
    }
  };

  // Categorized Grievance Lists
  const submittedGrievances = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.SUBMITTED),
    [deptGrievances]
  );
  const registeredGrievances = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.REGISTERED),
    [deptGrievances]
  );
  const activeAssignments = useMemo(
    () =>
      deptGrievances.filter(
        (g) =>
          g.status === STATUSES.ASSIGNED ||
          g.status === STATUSES.UNDER_REVIEW ||
          g.status === STATUSES.UNDER_INVESTIGATION ||
          g.status === STATUSES.REOPENED
      ),
    [deptGrievances]
  );
  const escalatedGrievances = useMemo(
    () =>
      deptGrievances.filter(
        (g) =>
          g.status === STATUSES.ESCALATED ||
          (g.status === STATUSES.UNDER_INVESTIGATION && currentTime > g.slaDeadline)
      ),
    [deptGrievances, currentTime]
  );

  const selectedDept = departments.find((d) => d.id === selectedDeptId);

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-fade-in">
      {/* Department Admin Banner */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="primary" dot className="font-bold text-xs uppercase">
                Department Console
              </Badge>
              <span className="text-xs text-slate-400 font-mono">
                Ethereum Sepolia ({chainId})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Department Operations & Triage
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Department Administrator:{' '}
              <span className="font-mono font-semibold text-slate-800">{address}</span>
            </p>
          </div>

          {/* Department Selector */}
          {departments.length > 1 && (
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500">Department:</span>
              <select
                value={selectedDeptId || ''}
                onChange={(e) => setSelectedDeptId(Number(e.target.value))}
                className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} (#{d.id})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Overview Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block font-medium">Department Name</span>
            <span className="text-sm sm:text-base font-bold text-slate-900 mt-1 block truncate">
              {selectedDept?.name || 'Department'}
            </span>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block font-medium">Pending Triage</span>
            <span className="text-lg font-bold text-blue-600 mt-1 block">
              {submittedGrievances.length + registeredGrievances.length}
            </span>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block font-medium">Active Officers</span>
            <span className="text-lg font-bold text-slate-900 mt-1 block">
              {deptOfficers.length}
            </span>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block font-medium">SLA Escalations</span>
            <span className={`text-lg font-bold mt-1 block ${escalatedGrievances.length > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {escalatedGrievances.length}
            </span>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <Alert variant="danger" title="Operation Notice" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert variant="success" title="Success" onClose={() => setSuccessMsg('')}>
          {successMsg}
        </Alert>
      )}

      {/* Section Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200">
        {[
          { id: 'triage', label: `Pending Triage (${submittedGrievances.length + registeredGrievances.length})` },
          { id: 'investigations', label: `Active Investigations (${activeAssignments.length})` },
          { id: 'escalations', label: `SLA Escalations (${escalatedGrievances.length})` },
          { id: 'officers', label: `Officer Roster (${deptOfficers.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeSection === tab.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. TRIAGE SECTION */}
      {activeSection === 'triage' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="Intake Triage & Officer Assignment"
            subtitle="Register new grievances and assign field officers for formal investigation"
          >
            {loading ? (
              <div className="py-10 text-center text-xs text-slate-500">Loading triage cases...</div>
            ) : submittedGrievances.length === 0 && registeredGrievances.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No incoming grievances currently awaiting departmental triage.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {[...submittedGrievances, ...registeredGrievances].map((g) => {
                  const sMeta = STATUS_METADATA[g.status] || { label: 'Unknown', badgeVariant: 'default' };
                  const pMeta = PRIORITY_METADATA[g.priority] || { label: 'Medium', badgeVariant: 'default' };

                  return (
                    <div
                      key={g.id}
                      className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 px-3 rounded-xl transition-colors"
                    >
                      <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">
                            #{g.id}
                          </span>
                          <Badge variant={sMeta.badgeVariant} dot className="text-[10px]">
                            {sMeta.label}
                          </Badge>
                          <Badge variant={pMeta.badgeVariant} className="text-[10px]">
                            {pMeta.label} Priority
                          </Badge>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">
                          {g.title}
                        </h4>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Submitted: {formatTimestamp(g.createdAt)} | Citizen: {shortenAddress(g.citizen, 5)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {g.status === STATUSES.SUBMITTED && (
                          <Button
                            size="xs"
                            variant="secondary"
                            loading={actionLoading === `reg_${g.id}`}
                            onClick={() => handleRegisterGrievance(g.id)}
                            className="font-bold"
                          >
                            1. Register Intake
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => {
                            setAssignTargetGrievance(g);
                            setSelectedOfficerForAssign(deptOfficers[0] || '');
                          }}
                          disabled={deptOfficers.length === 0}
                          className="font-bold"
                        >
                          {g.status === STATUSES.SUBMITTED ? '2. Assign Officer' : 'Assign Officer'}
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => navigate(`/dept-admin/grievance/${g.id}`)}
                        >
                          View Details
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectTargetGrievance(g);
                            setRejectReason('');
                          }}
                          className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 2. ACTIVE INVESTIGATIONS */}
      {activeSection === 'investigations' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="Active Investigations"
            subtitle="Cases currently under active probe by assigned department field officers"
          >
            {activeAssignments.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No cases currently assigned or under investigation.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Title</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Assigned Officer</th>
                      <th className="py-3 px-4">SLA Deadline</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeAssignments.map((g) => {
                      const sMeta = STATUS_METADATA[g.status] || { label: 'Unknown', badgeVariant: 'default' };
                      const isBreached = currentTime > g.slaDeadline;

                      return (
                        <tr key={g.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            #{g.id}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800 max-w-xs truncate">
                            {g.title}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={sMeta.badgeVariant} dot className="text-[10px]">
                              {sMeta.label}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                            <a
                              href={getExplorerAddressUrl(g.assignedOfficer)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline"
                            >
                              {shortenAddress(g.assignedOfficer, 5)}
                            </a>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px]">
                            <span className={isBreached ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                              {formatTimestamp(g.slaDeadline)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setReassignTarget(g);
                                  setNewOfficerForReassign(deptOfficers.find((o) => o.toLowerCase() !== g.assignedOfficer.toLowerCase()) || '');
                                  setReassignReason('');
                                }}
                                className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                              >
                                Reassign
                              </button>
                              <span>•</span>
                              <Button
                                size="xs"
                                variant="secondary"
                                onClick={() => navigate(`/dept-admin/grievance/${g.id}`)}
                              >
                                View
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 3. ESCALATIONS */}
      {activeSection === 'escalations' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="SLA Escalations & Critical Overdue Cases"
            subtitle="Cases that have breached their deterministic on-chain resolution deadline"
          >
            {escalatedGrievances.length === 0 ? (
              <div className="py-10 text-center text-xs text-emerald-700 bg-emerald-50/50 rounded-xl border border-emerald-200">
                ✓ All departmental grievances are currently within SLA deadlines!
              </div>
            ) : (
              <div className="space-y-3">
                {escalatedGrievances.map((g) => (
                  <div
                    key={g.id}
                    className="p-4 bg-rose-50/50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">#{g.id}</span>
                        <Badge variant="danger" dot>SLA BREACHED</Badge>
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm mt-1">{g.title}</h4>
                      <div className="text-[11px] text-slate-500 font-mono mt-1">
                        SLA Target: {formatTimestamp(g.slaDeadline)} | Officer: {shortenAddress(g.assignedOfficer, 5)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {g.status === STATUSES.ESCALATED ? (
                        <Button
                          size="xs"
                          variant="success"
                          loading={actionLoading === `res_esc_${g.id}`}
                          onClick={() => handleResolveEscalate(g.id)}
                          className="font-bold"
                        >
                          Resolve Escalation
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="danger"
                          loading={actionLoading === `esc_${g.id}`}
                          onClick={() => handleTriggerEscalate(g.id)}
                          className="font-bold"
                        >
                          Trigger Formal Escalation
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => navigate(`/dept-admin/grievance/${g.id}`)}
                      >
                        Inspect
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 4. OFFICERS ROSTER */}
      {activeSection === 'officers' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="Department Field Officer Roster"
            subtitle="Authoritative investigators enrolled under this department's jurisdiction"
            headerAction={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowAddOfficerModal(true)}
                className="font-bold"
              >
                + Add Officer
              </Button>
            }
          >
            {deptOfficers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No officers currently enrolled in this department. Click "+ Add Officer" to enroll field officers.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Officer Address</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Explorer</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deptOfficers.map((officerAddr) => (
                      <tr key={officerAddr} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {officerAddr}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="success" dot className="text-[10px]">Active</Badge>
                        </td>
                        <td className="py-3 px-4">
                          <a
                            href={getExplorerAddressUrl(officerAddr)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 underline font-mono text-[11px]"
                          >
                            Sepolia Etherscan ↗
                          </a>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setTransferTargetOfficer(officerAddr);
                                setTransferTargetDeptId(departments.find((d) => d.id !== selectedDeptId)?.id || '');
                              }}
                              className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                            >
                              Transfer
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveOfficer(officerAddr)}
                              className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODALS */}
      {/* =================================================================== */}

      {/* Assign Officer Modal */}
      <Modal
        isOpen={Boolean(assignTargetGrievance)}
        onClose={() => setAssignTargetGrievance(null)}
        title={`Assign Officer to Grievance #${assignTargetGrievance?.id}`}
        subtitle={assignTargetGrievance?.title}
      >
        <form onSubmit={handleAssignOfficer} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Field Officer *
            </label>
            {deptOfficers.length > 0 ? (
              <select
                value={selectedOfficerForAssign}
                onChange={(e) => setSelectedOfficerForAssign(e.target.value)}
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono outline-none"
              >
                {deptOfficers.map((o) => (
                  <option key={o} value={o}>
                    {shortenAddress(o, 6)} ({o})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-rose-600 font-semibold">
                No officers in department. Please enroll an officer first.
              </p>
            )}
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAssignTargetGrievance(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={actionLoading === 'assign'}
              disabled={deptOfficers.length === 0}
              className="font-bold"
            >
              Confirm Assignment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reassign Officer Modal */}
      <Modal
        isOpen={Boolean(reassignTarget)}
        onClose={() => setReassignTarget(null)}
        title={`Reassign Grievance #${reassignTarget?.id}`}
        subtitle={reassignTarget?.title}
      >
        <form onSubmit={handleReassignOfficer} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select New Officer *
            </label>
            <select
              value={newOfficerForReassign}
              onChange={(e) => setNewOfficerForReassign(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono outline-none"
            >
              {deptOfficers.map((o) => (
                <option key={o} value={o}>
                  {shortenAddress(o, 6)} {o.toLowerCase() === reassignTarget?.assignedOfficer?.toLowerCase() ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reassignment Justification Reason *
            </label>
            <textarea
              rows={3}
              required
              placeholder="State the reason for reassigning this case (logged on-chain)"
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none resize-none"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setReassignTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={actionLoading === 'reassign'}
              className="font-bold"
            >
              Execute Reassignment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reject Grievance Modal */}
      <Modal
        isOpen={Boolean(rejectTargetGrievance)}
        onClose={() => setRejectTargetGrievance(null)}
        title={`Reject Grievance #${rejectTargetGrievance?.id}?`}
        subtitle="This will permanently close the case as administratively rejected"
      >
        <form onSubmit={handleRejectGrievance} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Rejection Reason *
            </label>
            <textarea
              rows={3}
              required
              placeholder="Explain why this grievance is outside departmental jurisdiction or invalid"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none resize-none"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRejectTargetGrievance(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              loading={Boolean(actionLoading)}
              className="font-bold"
            >
              Confirm Rejection
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Officer Modal */}
      <Modal
        isOpen={showAddOfficerModal}
        onClose={() => setShowAddOfficerModal(false)}
        title="Add Officer to Department"
        subtitle={`Enrolls field officer into ${selectedDept?.name}`}
      >
        <form onSubmit={handleAddOfficer} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Officer Wallet Address (0x...) *
            </label>
            <input
              type="text"
              required
              placeholder="0x..."
              value={newOfficerAddress}
              onChange={(e) => setNewOfficerAddress(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono outline-none"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowAddOfficerModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={actionLoading === 'add_officer'}
              className="font-bold"
            >
              Enroll Officer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Transfer Officer Modal */}
      <Modal
        isOpen={Boolean(transferTargetOfficer)}
        onClose={() => setTransferTargetOfficer('')}
        title="Transfer Officer to Another Department"
        subtitle={`Officer: ${shortenAddress(transferTargetOfficer, 6)}`}
      >
        <form onSubmit={handleTransferOfficer} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Destination Department *
            </label>
            <select
              value={transferTargetDeptId}
              onChange={(e) => setTransferTargetDeptId(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
            >
              {departments
                .filter((d) => d.id !== selectedDeptId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} (#{d.id})
                  </option>
                ))}
            </select>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setTransferTargetOfficer('')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={Boolean(actionLoading)}
              className="font-bold"
            >
              Transfer Officer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirm Remove Officer Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmRemoveOfficer)}
        onClose={() => setConfirmRemoveOfficer(null)}
        onConfirm={executeRemoveOfficer}
        title="Remove Officer?"
        message={`Are you sure you want to remove officer ${shortenAddress(confirmRemoveOfficer, 6)} from ${selectedDept?.name}?`}
        confirmText="Remove Officer"
        variant="danger"
        loading={actionLoading === `remove_${confirmRemoveOfficer}`}
      />
    </div>
  );
}
