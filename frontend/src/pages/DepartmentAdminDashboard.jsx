import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRouter } from '../hooks/useRouter';
import { useRoles } from '../hooks/useRoles';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { formatTimestamp, shortenAddress } from '../utils/formatters';
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
  const { address, signer, provider, networkName, chainId } = useWallet();
  const { currentRole, ROLES } = useRoles();
  const { navigate } = useRouter();

  const [activeSection, setActiveSection] = useState('triage');
  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [deptOfficers, setDeptOfficers] = useState([]);
  const [deptGrievances, setDeptGrievances] = useState([]);
  const [_loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Form states
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
      
      // If user is super admin, allow viewing any department; if dept admin, filter for assigned
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
    loadDepartments();
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
    loadDeptData();
  }, [loadDeptData]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  // Register intake (SUBMITTED -> REGISTERED)
  const handleRegisterGrievance = async (grievanceId) => {
    try {
      setActionLoading(`reg_${grievanceId}`);
      setError(null);
      setSuccessMsg('');
      await registerGrievance(signer, grievanceId);
      setSuccessMsg(`Grievance #${grievanceId} formally registered in department intake.`);
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

      // Check if address already has global OFFICER_ROLE
      const roles = await fetchUserRoles(runner, newOfficerAddress.trim());
      if (!roles.isOfficer) {
        // Dept Admin or Super Admin can grant OFFICER_ROLE
        await grantOfficerRole(signer, newOfficerAddress.trim());
      }

      // Add to department
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
  const handleRemoveOfficer = async (officerAddr) => {
    try {
      setActionLoading(`remove_${officerAddr}`);
      setError(null);
      setSuccessMsg('');
      await removeOfficerFromDepartment(signer, selectedDeptId, officerAddr);
      setSuccessMsg(`Officer ${shortenAddress(officerAddr, 6)} removed from department.`);
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

  // --------------------------------------------------------------------------
  // Categorized Grievance Lists
  // --------------------------------------------------------------------------
  const submittedGrievances = deptGrievances.filter((g) => g.status === STATUSES.SUBMITTED);
  const registeredGrievances = deptGrievances.filter((g) => g.status === STATUSES.REGISTERED);
  const activeAssignments = deptGrievances.filter(
    (g) =>
      g.status === STATUSES.ASSIGNED ||
      g.status === STATUSES.UNDER_REVIEW ||
      g.status === STATUSES.UNDER_INVESTIGATION ||
      g.status === STATUSES.REOPENED
  );
  const escalatedGrievances = deptGrievances.filter(
    (g) =>
      g.status === STATUSES.ESCALATED ||
      (g.status === STATUSES.UNDER_INVESTIGATION && Math.floor(Date.now() / 1000) > g.slaDeadline)
  );

  const selectedDept = departments.find((d) => d.id === selectedDeptId);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Department Admin Banner */}
      <Card className="bg-linear-to-r from-zinc-900 via-slate-900 to-blue-950 text-white border-0 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="neutral" className="bg-zinc-800 text-zinc-200 border-zinc-600">
                Department Administrator
              </Badge>
              <span className="text-xs text-slate-300 font-mono">
                Chain ID: {chainId} ({networkName})
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Department Administration Console</h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Admin Account: <span className="font-mono font-semibold text-white">{address}</span>
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            {departments.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300">Active Dept:</span>
                <select
                  value={selectedDeptId || ''}
                  onChange={(e) => setSelectedDeptId(Number(e.target.value))}
                  className="text-xs bg-slate-800 text-white border border-slate-700 rounded px-2.5 py-1 outline-none font-semibold"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      #{d.id} {d.name} {!d.isActive && '(Deactivated)'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <span className="text-[11px] text-slate-400">
              Governed by DepartmentManager.sol & GrievanceSystem.sol
            </span>
          </div>
        </div>
      </Card>

      {/* Global Alerts */}
      {error && (
        <Alert variant="danger" title="Operation Error">
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert variant="success" title="Success">
          {successMsg}
        </Alert>
      )}

      {/* Admin Quick Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200">
        {[
          { id: 'triage', label: `Triage Queue (${submittedGrievances.length + registeredGrievances.length})` },
          { id: 'officers', label: `Officer Roster (${deptOfficers.length})` },
          { id: 'assignments', label: `Active Cases (${activeAssignments.length})` },
          { id: 'sla', label: `SLA Escalations (${escalatedGrievances.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeSection === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* SECTION 1: TRIAGE & INTAKE */}
      {/* ------------------------------------------------------------------- */}
      {activeSection === 'triage' && (
        <div className="space-y-6">
          <Card
            title={`Triage & Registration Queue — ${selectedDept ? selectedDept.name : 'Department'}`}
            subtitle="Citizen-filed grievances awaiting formal intake registration and officer assignment"
          >
            {submittedGrievances.length === 0 && registeredGrievances.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-lg mx-auto">
                  📥
                </div>
                <h4 className="text-sm font-semibold text-slate-700">Triage Queue Empty</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  No unregistered grievances targeting this department currently exist on the blockchain.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1A: Submitted Grievances awaiting Register */}
                {submittedGrievances.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Awaiting Department Registration ({submittedGrievances.length})
                    </h4>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                      {submittedGrievances.map((g) => {
                        const prio = PRIORITY_METADATA[g.priority] || { label: 'Medium', badgeVariant: 'default' };
                        return (
                          <div key={g.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">#{g.id}</span>
                                <Badge variant={prio.badgeVariant}>{prio.label}</Badge>
                                <span className="font-semibold text-slate-800 text-sm">{g.title}</span>
                              </div>
                              <div className="text-slate-500 text-[11px] flex gap-3">
                                <span>Citizen: {shortenAddress(g.citizen, 5)}</span>
                                <span>Submitted: {formatTimestamp(g.createdAt)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => navigate(`/grievance/${g.id}`)}
                              >
                                View Record
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                loading={actionLoading === `reg_${g.id}`}
                                onClick={() => handleRegisterGrievance(g.id)}
                              >
                                Register Intake
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                  setRejectTargetGrievance(g);
                                  setRejectReason('');
                                }}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 1B: Registered Grievances awaiting Officer Assignment */}
                {registeredGrievances.length > 0 && (
                  <div className="space-y-2 pt-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Registered — Awaiting Officer Assignment ({registeredGrievances.length})
                    </h4>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                      {registeredGrievances.map((g) => {
                        const prio = PRIORITY_METADATA[g.priority] || { label: 'Medium', badgeVariant: 'default' };
                        return (
                          <div key={g.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">#{g.id}</span>
                                <Badge variant="neutral">REGISTERED</Badge>
                                <Badge variant={prio.badgeVariant}>{prio.label}</Badge>
                                <span className="font-semibold text-slate-800 text-sm">{g.title}</span>
                              </div>
                              <div className="text-slate-500 text-[11px] flex gap-3">
                                <span>Citizen: {shortenAddress(g.citizen, 5)}</span>
                                <span>SLA Deadline: {formatTimestamp(g.slaDeadline)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => navigate(`/grievance/${g.id}`)}
                              >
                                View Record
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setAssignTargetGrievance(g)}
                              >
                                Assign Officer
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                  setRejectTargetGrievance(g);
                                  setRejectReason('');
                                }}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Assign Officer Modal / Dialog */}
          {assignTargetGrievance && (
            <Card
              title={`Assign Officer to Grievance #${assignTargetGrievance.id}`}
              subtitle={assignTargetGrievance.title}
              className="border-blue-300 bg-blue-50/20"
            >
              <form onSubmit={handleAssignOfficer} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Handling Officer from Department Roster *
                  </label>
                  {deptOfficers.length === 0 ? (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                      No officers are currently enrolled in this department. Please add an officer in the "Officer Roster" tab first.
                    </div>
                  ) : (
                    <select
                      required
                      value={selectedOfficerForAssign}
                      onChange={(e) => setSelectedOfficerForAssign(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded outline-none bg-white"
                    >
                      <option value="">-- Choose Officer --</option>
                      {deptOfficers.map((off) => (
                        <option key={off} value={off}>
                          {off}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setAssignTargetGrievance(null);
                      setSelectedOfficerForAssign('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={actionLoading === 'assign'}
                    disabled={deptOfficers.length === 0}
                  >
                    Confirm Officer Assignment
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Reject Grievance Modal */}
          {rejectTargetGrievance && (
            <Card
              title={`Reject Grievance #${rejectTargetGrievance.id}`}
              subtitle={rejectTargetGrievance.title}
              className="border-rose-300 bg-rose-50/20"
            >
              <form onSubmit={handleRejectGrievance} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rejection Reason / Grounds *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="State the administrative or jurisdiction grounds for rejection..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded outline-none bg-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setRejectTargetGrievance(null);
                      setRejectReason('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="danger"
                    size="sm"
                    loading={actionLoading === `reject_${rejectTargetGrievance.id}`}
                    disabled={!rejectReason.trim()}
                  >
                    Confirm Administrative Rejection
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* SECTION 2: OFFICER ROSTER */}
      {/* ------------------------------------------------------------------- */}
      {activeSection === 'officers' && (
        <Card
          title="Department Officer Roster"
          subtitle={`Staff members authorized to handle cases for ${selectedDept ? selectedDept.name : 'this department'}`}
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">
                Department officers are verified via <code className="font-mono text-slate-700">DepartmentManager.isOfficerInDepartment()</code>.
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowAddOfficerModal(true)}
              >
                + Add Officer to Department
              </Button>
            </div>

            {/* Add Officer Modal */}
            {showAddOfficerModal && (
              <form
                onSubmit={handleAddOfficer}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
              >
                <h4 className="text-xs font-bold text-slate-800">
                  Enroll Officer into {selectedDept?.name}
                </h4>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Officer Wallet Address (0x...) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0x..."
                    value={newOfficerAddress}
                    onChange={(e) => setNewOfficerAddress(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-mono outline-none bg-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    If this address does not already hold the global Officer role, the Department Admin will grant it automatically.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAddOfficerModal(false);
                      setNewOfficerAddress('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={actionLoading === 'add_officer'}
                  >
                    Enroll Officer
                  </Button>
                </div>
              </form>
            )}

            {deptOfficers.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50 rounded-lg border border-dashed border-slate-200 space-y-2">
                <div className="text-lg">👥</div>
                <h4 className="text-xs font-semibold text-slate-700">No Officers Enrolled</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Enroll qualified officer addresses above to assign incoming grievances.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-hidden">
                {deptOfficers.map((offAddr, idx) => (
                  <div key={offAddr} className="p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <Badge variant="neutral" className="font-mono text-[10px]">
                        #{idx + 1}
                      </Badge>
                      <span className="font-mono text-slate-900 font-semibold">{offAddr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setTransferTargetOfficer(offAddr);
                          setTransferTargetDeptId('');
                        }}
                        className="text-[11px] py-1 px-2.5"
                      >
                        Transfer
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={actionLoading === `remove_${offAddr}`}
                        onClick={() => handleRemoveOfficer(offAddr)}
                        className="text-[11px] py-1 px-2.5"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Transfer Officer Modal */}
            {transferTargetOfficer && (
              <Card
                title="Transfer Officer to Another Department"
                subtitle={`Officer: ${transferTargetOfficer}`}
                className="border-indigo-300 bg-indigo-50/20 mt-4"
              >
                <form onSubmit={handleTransferOfficer} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Destination Department *
                    </label>
                    <select
                      required
                      value={transferTargetDeptId}
                      onChange={(e) => setTransferTargetDeptId(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded outline-none bg-white"
                    >
                      <option value="">-- Choose Destination Department --</option>
                      {departments
                        .filter((d) => d.id !== selectedDeptId)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            #{d.id} - {d.name} {d.isActive ? '' : '(Inactive)'}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setTransferTargetOfficer('');
                        setTransferTargetDeptId('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={actionLoading === `transfer_${transferTargetOfficer}`}
                      disabled={!transferTargetDeptId}
                    >
                      Confirm Transfer
                    </Button>
                  </div>
                </form>
              </Card>
            )}
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* SECTION 3: CASE ASSIGNMENTS & REASSIGNMENT */}
      {/* ------------------------------------------------------------------- */}
      {activeSection === 'assignments' && (
        <div className="space-y-6">
          <Card
            title="Active Case Assignments"
            subtitle="Under investigation or review with active officer accountability"
          >
            {activeAssignments.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-2 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <div className="text-lg">📂</div>
                <h4 className="text-xs font-semibold text-slate-700">No Active Case Assignments</h4>
                <p className="text-xs text-slate-500">
                  Assigned grievances in progress will appear here with reassignment controls.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-hidden">
                {activeAssignments.map((g) => {
                  const sMeta = STATUS_METADATA[g.status] || { label: 'Active', badgeVariant: 'default' };
                  const pMeta = PRIORITY_METADATA[g.priority] || { label: 'Medium', badgeVariant: 'default' };
                  const isBreached = Math.floor(Date.now() / 1000) > g.slaDeadline;

                  return (
                    <div key={g.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">#{g.id}</span>
                          <Badge variant={sMeta.badgeVariant}>{sMeta.label}</Badge>
                          <Badge variant={pMeta.badgeVariant}>{pMeta.label}</Badge>
                          {isBreached && <Badge variant="danger">SLA Breached</Badge>}
                          <span className="font-semibold text-slate-800 text-sm">{g.title}</span>
                        </div>
                        <div className="text-slate-500 text-[11px] flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            Handling Officer:{' '}
                            <span className="font-mono text-slate-800 font-medium">
                              {shortenAddress(g.assignedOfficer, 6)}
                            </span>
                          </span>
                          <span>Deadline: {formatTimestamp(g.slaDeadline)}</span>
                          <span>Reopen Count: {g.reopenCount}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/grievance/${g.id}`)}
                        >
                          View Details
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setReassignTarget(g)}
                        >
                          Reassign Officer
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Reassign Officer Form */}
          {reassignTarget && (
            <Card
              title={`Reassign Grievance #${reassignTarget.id}`}
              subtitle={reassignTarget.title}
              className="border-amber-300 bg-amber-50/20"
            >
              <form onSubmit={handleReassignOfficer} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select New Handling Officer *
                  </label>
                  <select
                    required
                    value={newOfficerForReassign}
                    onChange={(e) => setNewOfficerForReassign(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded outline-none bg-white"
                  >
                    <option value="">-- Choose Officer --</option>
                    {deptOfficers
                      .filter((off) => off.toLowerCase() !== reassignTarget.assignedOfficer?.toLowerCase())
                      .map((off) => (
                        <option key={off} value={off}>
                          {off}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reassignment Justification / Audit Reason *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Officer transferred, specialized technical skills needed..."
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded outline-none bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setReassignTarget(null);
                      setNewOfficerForReassign('');
                      setReassignReason('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={actionLoading === 'reassign'}
                  >
                    Confirm Reassignment
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* SECTION 4: SLA ESCALATION MONITORING */}
      {/* ------------------------------------------------------------------- */}
      {activeSection === 'sla' && (
        <Card
          title="SLA Escalation Monitoring"
          subtitle="Grievances with expired SLA resolution deadlines or under administrative escalation"
        >
          {escalatedGrievances.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <div className="text-lg">⏱️</div>
              <h4 className="text-xs font-semibold text-slate-700">No Breached or Escalated Grievances</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                All departmental cases are within compliance windows.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-hidden">
              {escalatedGrievances.map((g) => {
                const isEsc = g.status === STATUSES.ESCALATED;
                return (
                  <div key={g.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">#{g.id}</span>
                        {isEsc ? (
                          <Badge variant="danger">ESCALATED</Badge>
                        ) : (
                          <Badge variant="danger">SLA Breached</Badge>
                        )}
                        <span className="font-semibold text-slate-800 text-sm">{g.title}</span>
                      </div>
                      <div className="text-slate-500 text-[11px] flex flex-wrap gap-x-4">
                        <span>Officer: {shortenAddress(g.assignedOfficer, 6)}</span>
                        <span>Deadline was: {formatTimestamp(g.slaDeadline)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/grievance/${g.id}`)}
                      >
                        Inspect
                      </Button>
                      {!isEsc && (
                        <Button
                          variant="danger"
                          size="sm"
                          loading={actionLoading === `esc_${g.id}`}
                          onClick={() => handleTriggerEscalate(g.id)}
                        >
                          Trigger Escalation
                        </Button>
                      )}
                      {isEsc && (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={actionLoading === `res_esc_${g.id}`}
                          onClick={() => handleResolveEscalate(g.id)}
                        >
                          Resolve & Resume
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
