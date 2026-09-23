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
  fetchDepartmentCategories,
  getAdminDepartments,
  createCategory,
  updateCategory,
  deactivateCategory,
  reactivateCategory,
  validateCategoryCreationPreflight,
} from '../services/departmentService';
import { grantOfficerRole } from '../services/adminRoleService';
import { fetchUserRoles } from '../services/roleService';
import {
  escalateGrievance,
  resolveEscalation,
} from '../services/escalationService';
import { fetchAuditsByTarget } from '../services/auditService';

export function DepartmentAdminDashboard() {
  const { address, signer, provider, chainId } = useWallet();
  const { currentRole, ROLES } = useRoles();
  const { navigate } = useRouter();

  const [activeSection, setActiveSection] = useState('all_cases');
  const [departments, setDepartments] = useState([]);
  const [allSystemDepartments, setAllSystemDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [deptOfficers, setDeptOfficers] = useState([]);
  const [deptGrievances, setDeptGrievances] = useState([]);
  const [allCasesFilter, setAllCasesFilter] = useState('all');
  const [allCasesSearch, setAllCasesSearch] = useState('');
  const [selectedOfficerFilter, setSelectedOfficerFilter] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [currentTime] = useState(() => Math.floor(Date.now() / 1000));

  // SLA Escalation sub-filter
  const [slaFilter, setSlaFilter] = useState('all');

  // Case inspect modal
  const [inspectingCase, setInspectingCase] = useState(null);
  const [caseAudits, setCaseAudits] = useState([]);
  const [loadingCaseAudits, setLoadingCaseAudits] = useState(false);

  // Department Audit trail state
  const [deptAuditsList, setDeptAuditsList] = useState([]);
  const [loadingAudits, setLoadingAudits] = useState(false);

  // Transaction Status UX
  const [txStatus, setTxStatus] = useState({ phase: '', message: '' });
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

  // Department Categories state
  const [deptCategories, setDeptCategories] = useState([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDesc, setCategoryDesc] = useState('');
  const [categorySuccessDetails, setCategorySuccessDetails] = useState(null);

  const runner = provider || signer;

  // 0. Account switching & Isolation: Immediately clear stale state when wallet account changes
  useEffect(() => {
    setSelectedDeptId(null);
    setDepartments([]);
    setDeptOfficers([]);
    setDeptGrievances([]);
    setDeptCategories([]);
    setDeptAuditsList([]);
    setInspectingCase(null);
    setSelectedOfficerFilter('');
    setSelectedCategoryFilter('');
    setSelectedPriorityFilter('');
    setError(null);
    setSuccessMsg('');
    setCategorySuccessDetails(null);
    setTxStatus({ phase: '', message: '' });
  }, [address, chainId]);

  // 1. Load departments managed by this admin
  const loadDepartments = useCallback(async () => {
    if (!runner) return;
    try {
      setLoading(true);
      setError(null);
      const all = await fetchAllDepartments(runner);
      setAllSystemDepartments(all);

      let adminDepts = all;
      if (currentRole !== ROLES.SUPER_ADMIN && address) {
        try {
          const directIds = await getAdminDepartments(runner, address);
          if (directIds.length > 0) {
            const idSet = new Set(directIds.map(Number));
            adminDepts = all.filter(
              (d) => idSet.has(Number(d.id)) || (d.admin && d.admin.toLowerCase() === address.toLowerCase())
            );
          } else {
            adminDepts = all.filter(
              (d) => d.admin && d.admin.toLowerCase() === address.toLowerCase()
            );
          }
        } catch {
          adminDepts = all.filter(
            (d) => d.admin && d.admin.toLowerCase() === address.toLowerCase()
          );
        }
      }

      setDepartments(adminDepts);
      if (adminDepts.length > 0) {
        if (!selectedDeptId || !adminDepts.some((d) => d.id === selectedDeptId)) {
          setSelectedDeptId(adminDepts[0].id);
        }
      } else {
        setSelectedDeptId(null);
      }
    } catch (err) {
      console.error('Failed to load departments:', err);
      setError('Unable to load current Sepolia blockchain state: ' + (err?.shortMessage || err?.message || 'Check RPC connection.'));
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

  // 2. Load selected department data (officers, grievances, categories, and real on-chain audit trail)
  const loadDeptData = useCallback(async () => {
    if (!selectedDeptId || !runner) return;
    try {
      setLoading(true);
      const [officers, grievances, categories] = await Promise.all([
        fetchDepartmentOfficers(runner, selectedDeptId),
        fetchGrievancesByDepartment(runner, selectedDeptId),
        fetchDepartmentCategories(runner, selectedDeptId),
      ]);
      setDeptOfficers(officers);
      setDeptGrievances(grievances);
      setDeptCategories(categories);

      // Fetch on-chain audits for this department and its grievances
      try {
        setLoadingAudits(true);
        const deptAudits = await fetchAuditsByTarget(runner, selectedDeptId);
        const gAuditPromises = grievances.slice(0, 15).map((g) => fetchAuditsByTarget(runner, g.id));
        const gAuditsArrays = await Promise.all(gAuditPromises);
        const combined = [...deptAudits, ...gAuditsArrays.flat()];
        const unique = Array.from(new Map(combined.map((a) => [a.id, a])).values());
        unique.sort((a, b) => b.id - a.id);
        setDeptAuditsList(unique);
      } catch (auditErr) {
        console.warn('Audit fetch warning:', auditErr);
      } finally {
        setLoadingAudits(false);
      }
    } catch (err) {
      console.error('Failed to load department details:', err);
      setError('Unable to load current Sepolia blockchain state: ' + (err?.shortMessage || err?.message || 'Department details query failed.'));
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

  // Open Case Inspection Modal with on-chain audit verification
  const openInspectModal = async (grievance) => {
    setInspectingCase(grievance);
    setCaseAudits([]);
    if (runner && grievance?.id) {
      try {
        setLoadingCaseAudits(true);
        const audits = await fetchAuditsByTarget(runner, grievance.id);
        audits.sort((a, b) => b.id - a.id);
        setCaseAudits(audits);
      } catch (e) {
        console.warn('Could not load case audits:', e);
      } finally {
        setLoadingCaseAudits(false);
      }
    }
  };

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

  // Categorized Grievance Lists & Counts
  const totalGrievanceCount = deptGrievances.length;

  const submittedGrievances = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.SUBMITTED),
    [deptGrievances]
  );
  const registeredGrievances = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.REGISTERED),
    [deptGrievances]
  );
  const pendingCount = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.SUBMITTED || g.status === STATUSES.REGISTERED).length,
    [deptGrievances]
  );
  const investigatingCount = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.UNDER_REVIEW || g.status === STATUSES.UNDER_INVESTIGATION).length,
    [deptGrievances]
  );
  const resolutionsCount = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.RESOLUTION_PROPOSED || g.status === STATUSES.CITIZEN_REVIEW).length,
    [deptGrievances]
  );
  const resolvedCount = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.ACCEPTED).length,
    [deptGrievances]
  );
  const closedCount = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.CLOSED).length,
    [deptGrievances]
  );
  const rejectedCount = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.REJECTED).length,
    [deptGrievances]
  );
  const reopenedCount = useMemo(
    () => deptGrievances.filter((g) => g.status === STATUSES.REOPENED).length,
    [deptGrievances]
  );
  const escalatedCount = useMemo(
    () =>
      deptGrievances.filter(
        (g) =>
          g.status === STATUSES.ESCALATED ||
          (g.status === STATUSES.UNDER_INVESTIGATION && currentTime > g.slaDeadline)
      ).length,
    [deptGrievances, currentTime]
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

  // SLA Sub-category lists
  const activeSlaCases = useMemo(() => {
    return deptGrievances.filter((g) =>
      [STATUSES.REGISTERED, STATUSES.ASSIGNED, STATUSES.UNDER_REVIEW, STATUSES.UNDER_INVESTIGATION, STATUSES.REOPENED].includes(g.status) &&
      currentTime <= g.slaDeadline
    );
  }, [deptGrievances, currentTime]);

  const overdueCases = useMemo(() => {
    return deptGrievances.filter((g) =>
      [STATUSES.REGISTERED, STATUSES.ASSIGNED, STATUSES.UNDER_REVIEW, STATUSES.UNDER_INVESTIGATION, STATUSES.REOPENED].includes(g.status) &&
      currentTime > g.slaDeadline
    );
  }, [deptGrievances, currentTime]);

  const formallyEscalatedCases = useMemo(() => {
    return deptGrievances.filter((g) => g.status === STATUSES.ESCALATED);
  }, [deptGrievances]);

  const approachingDeadlineCases = useMemo(() => {
    const oneDayInSec = 86400;
    return deptGrievances.filter((g) =>
      [STATUSES.REGISTERED, STATUSES.ASSIGNED, STATUSES.UNDER_REVIEW, STATUSES.UNDER_INVESTIGATION, STATUSES.REOPENED].includes(g.status) &&
      currentTime <= g.slaDeadline &&
      (g.slaDeadline - currentTime) <= oneDayInSec
    );
  }, [deptGrievances, currentTime]);

  const completedSlaCases = useMemo(() => {
    return deptGrievances.filter((g) =>
      [STATUSES.ACCEPTED, STATUSES.CLOSED, STATUSES.REJECTED].includes(g.status)
    );
  }, [deptGrievances]);

  const filteredAllCases = useMemo(() => {
    return deptGrievances.filter((g) => {
      // 1. Status filtering
      if (allCasesFilter === 'pending' && !(g.status === STATUSES.SUBMITTED || g.status === STATUSES.REGISTERED)) return false;
      if (allCasesFilter === 'investigating' && !(g.status === STATUSES.UNDER_REVIEW || g.status === STATUSES.UNDER_INVESTIGATION)) return false;
      if (allCasesFilter === 'resolution' && !(g.status === STATUSES.RESOLUTION_PROPOSED || g.status === STATUSES.CITIZEN_REVIEW)) return false;
      if (allCasesFilter === 'resolved' && g.status !== STATUSES.ACCEPTED) return false;
      if (allCasesFilter === 'rejected' && g.status !== STATUSES.REJECTED) return false;
      if (allCasesFilter === 'reopened' && g.status !== STATUSES.REOPENED) return false;
      if (allCasesFilter === 'escalated' && g.status !== STATUSES.ESCALATED) return false;
      if (allCasesFilter === 'closed' && g.status !== STATUSES.CLOSED) return false;

      // 2. Officer filter
      if (selectedOfficerFilter) {
        if (!g.assignedOfficer || g.assignedOfficer.toLowerCase() !== selectedOfficerFilter.toLowerCase()) {
          return false;
        }
      }

      // 3. Category filter
      if (selectedCategoryFilter) {
        if (String(g.categoryId) !== String(selectedCategoryFilter)) {
          return false;
        }
      }

      // 4. Priority filter
      if (selectedPriorityFilter !== '') {
        if (String(g.priority) !== String(selectedPriorityFilter)) {
          return false;
        }
      }

      // 5. Keyword search
      if (allCasesSearch.trim()) {
        const q = allCasesSearch.toLowerCase().trim();
        const idMatch = String(g.id).includes(q);
        const titleMatch = (g.title || '').toLowerCase().includes(q);
        const citizenMatch = (g.citizen || '').toLowerCase().includes(q);
        const officerMatch = (g.assignedOfficer || '').toLowerCase().includes(q);
        if (!idMatch && !titleMatch && !citizenMatch && !officerMatch) return false;
      }
      return true;
    });
  }, [
    deptGrievances,
    allCasesFilter,
    selectedOfficerFilter,
    selectedCategoryFilter,
    selectedPriorityFilter,
    allCasesSearch,
  ]);

  const selectedDept = departments.find((d) => d.id === selectedDeptId);

  // Strict Department Isolation Guard: If wallet has no department assigned, block access
  if (!loading && departments.length === 0 && currentRole !== ROLES.SUPER_ADMIN) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center animate-fade-in space-y-4">
        <div className="p-8 bg-white rounded-3xl border border-slate-200/90 shadow-xs space-y-3">
          <Badge variant="warning" size="md">Restricted Access</Badge>
          <h2 className="text-xl font-bold text-slate-900">No Department Assigned</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            The connected account (<span className="font-mono font-semibold text-slate-700">{shortenAddress(address, 6)}</span>) is not assigned as an administrator for any department in the DepartmentManager contract.
          </p>
          <p className="text-xs text-slate-400">
            Please switch to an authorized Department Administrator wallet in MetaMask.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto animate-fade-in">
      {/* Department Admin Banner */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 p-4 sm:p-6 lg:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 pb-5 sm:pb-6 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="primary" dot className="font-bold text-xs uppercase">
                Department Console
              </Badge>
              <span className="text-xs text-slate-400 font-mono">
                Ethereum Sepolia ({chainId})
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              {selectedDept ? selectedDept.name : 'Department Operations & Triage'}
            </h1>
            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs sm:text-sm text-slate-600">
              {selectedDept && (
                <span>
                  Department ID:{' '}
                  <span className="font-mono font-bold text-slate-900">#{selectedDept.id}</span>
                </span>
              )}
              <span className="break-all sm:break-normal">
                Department Administrator:{' '}
                <span className="font-mono font-semibold text-slate-800">
                  <span className="sm:hidden">{shortenAddress(address, 6)}</span>
                  <span className="hidden sm:inline">{address}</span>
                </span>
              </span>
            </div>
          </div>

          {/* Department Selector for Multiple Departments */}
          {departments.length > 1 && (
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 p-2 rounded-2xl shrink-0">
              <span className="text-xs font-bold text-slate-600">Department:</span>
              <select
                value={selectedDeptId || ''}
                onChange={(e) => setSelectedDeptId(Number(e.target.value))}
                className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
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

        {/* Overview Metric Cards (Department-Wide Counts) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5 pt-5 sm:pt-6 text-xs">
          <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-medium truncate">Total Grievances</span>
            <span className="text-lg sm:text-xl font-bold text-slate-900 mt-1 block">
              {totalGrievanceCount}
            </span>
          </div>
          <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-medium truncate">Pending Triage</span>
            <span className="text-lg sm:text-xl font-bold text-blue-600 mt-1 block">
              {pendingCount}
            </span>
          </div>
          <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-medium truncate">Investigating</span>
            <span className="text-lg sm:text-xl font-bold text-indigo-600 mt-1 block">
              {investigatingCount}
            </span>
          </div>
          <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-medium truncate">Resolutions</span>
            <span className="text-lg sm:text-xl font-bold text-amber-600 mt-1 block">
              {resolutionsCount}
            </span>
          </div>
          <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-medium truncate">Resolved</span>
            <span className="text-lg sm:text-xl font-bold text-emerald-600 mt-1 block">
              {resolvedCount}
            </span>
          </div>
          <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-medium truncate">Closed Cases</span>
            <span className="text-lg sm:text-xl font-bold text-slate-700 mt-1 block">
              {closedCount}
            </span>
          </div>
          <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-medium truncate">Rejected</span>
            <span className="text-lg sm:text-xl font-bold text-rose-600 mt-1 block">
              {rejectedCount}
            </span>
          </div>
          <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-medium truncate">SLA Escalations</span>
            <span className={`text-lg sm:text-xl font-bold mt-1 block ${escalatedCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {escalatedCount}
            </span>
          </div>
          <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-medium truncate">Active Officers</span>
            <span className="text-lg sm:text-xl font-bold text-slate-900 mt-1 block">
              {deptOfficers.length}
            </span>
          </div>
          <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-medium truncate">Categories</span>
            <span className="text-lg sm:text-xl font-bold text-slate-900 mt-1 block">
              {deptCategories.length}
            </span>
          </div>
        </div>
      </div>

      {/* Live Transaction Status Banner */}
      {txStatus.phase && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 animate-fade-in text-xs font-semibold ${
            txStatus.phase === 'confirming'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : txStatus.phase === 'pending'
              ? 'bg-blue-50 border-blue-200 text-blue-900'
              : txStatus.phase === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {txStatus.phase === 'confirming' && (
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping inline-block" />
          )}
          {txStatus.phase === 'pending' && (
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse inline-block" />
          )}
          {txStatus.phase === 'success' && <span>✓</span>}
          {txStatus.phase === 'error' && <span>⚠</span>}
          <span>{txStatus.message}</span>
        </div>
      )}

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
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 border-b border-slate-200">
        {[
          { id: 'all_cases', label: `Department Grievance History (${totalGrievanceCount})` },
          { id: 'triage', label: `Pending Triage (${pendingCount})` },
          { id: 'investigations', label: `Active Investigations (${activeAssignments.length})` },
          { id: 'escalations', label: `SLA Escalations (${escalatedCount})` },
          { id: 'officers', label: `Officer Roster (${deptOfficers.length})` },
          { id: 'categories', label: `Categories (${deptCategories.length})` },
          { id: 'audit', label: `Audit Trail (${deptAuditsList.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`px-3.5 sm:px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer shrink-0 ${
              activeSection === tab.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 0. ALL DEPARTMENT CASES SECTION */}
      {activeSection === 'all_cases' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title={`Department Grievance History — ${selectedDept?.name || 'Department'}`}
            subtitle="Authoritative historical ledger of all 12 grievance lifecycle states (Submitted, Assigned, Under Review, Under Investigation, Resolution Proposed, Citizen Review, Accepted, Resolved, Rejected, Reopened, Escalated, Closed)"
          >
            <div className="space-y-4">
              {/* Status Filters & Search */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'all', label: 'All', count: totalGrievanceCount },
                    { id: 'pending', label: 'Pending', count: pendingCount },
                    { id: 'investigating', label: 'Investigating', count: investigatingCount },
                    { id: 'resolution', label: 'Resolution', count: resolutionsCount },
                    { id: 'resolved', label: 'Resolved', count: resolvedCount },
                    { id: 'rejected', label: 'Rejected', count: rejectedCount },
                    { id: 'reopened', label: 'Reopened', count: reopenedCount },
                    { id: 'escalated', label: 'Escalated', count: escalatedCount },
                    { id: 'closed', label: 'Closed', count: closedCount },
                  ].map((filterTab) => (
                    <button
                      key={filterTab.id}
                      type="button"
                      onClick={() => setAllCasesFilter(filterTab.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        allCasesFilter === filterTab.id
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {filterTab.label} ({filterTab.count})
                    </button>
                  ))}
                </div>

                {/* Keyword Search */}
                <div className="w-full sm:w-72">
                  <input
                    type="text"
                    placeholder="Search by ID, Title, Citizen or Officer..."
                    value={allCasesSearch}
                    onChange={(e) => setAllCasesSearch(e.target.value)}
                    className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>

              {/* Secondary Filters: Officer, Category, Priority */}
              <div className="flex flex-wrap items-center gap-3 pb-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium">Officer:</span>
                  <select
                    value={selectedOfficerFilter}
                    onChange={(e) => setSelectedOfficerFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 outline-none text-xs font-mono"
                  >
                    <option value="">All Officers</option>
                    {deptOfficers.map((o) => (
                      <option key={o} value={o}>
                        {shortenAddress(o, 6)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium">Category:</span>
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 outline-none text-xs"
                  >
                    <option value="">All Categories</option>
                    {deptCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium">Priority:</span>
                  <select
                    value={selectedPriorityFilter}
                    onChange={(e) => setSelectedPriorityFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 outline-none text-xs font-semibold"
                  >
                    <option value="">All Priorities</option>
                    <option value="0">Low</option>
                    <option value="1">Medium</option>
                    <option value="2">High</option>
                    <option value="3">Critical</option>
                  </select>
                </div>

                {(allCasesFilter !== 'all' || selectedOfficerFilter || selectedCategoryFilter || selectedPriorityFilter !== '' || allCasesSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAllCasesFilter('all');
                      setSelectedOfficerFilter('');
                      setSelectedCategoryFilter('');
                      setSelectedPriorityFilter('');
                      setAllCasesSearch('');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline ml-auto"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              {/* Cases Table */}
              {loading ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Loading department grievances from Sepolia ledger...
                </div>
              ) : filteredAllCases.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No grievances found matching the selected filter.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">ID</th>
                        <th className="py-3 px-4">Title</th>
                        <th className="py-3 px-4">Citizen</th>
                        <th className="py-3 px-4">Assigned Officer</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Priority</th>
                        <th className="py-3 px-4">SLA Deadline</th>
                        <th className="py-3 px-4">Created Date</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAllCases.map((g) => {
                        const sMeta = STATUS_METADATA[g.status] || { label: 'Unknown', badgeVariant: 'default' };
                        const pMeta = PRIORITY_METADATA[g.priority] || { label: 'Medium', badgeVariant: 'default' };
                        const isCompleted = g.status === STATUSES.ACCEPTED || g.status === STATUSES.CLOSED;
                        const isBreached =
                          (g.status === STATUSES.UNDER_INVESTIGATION || g.status === STATUSES.UNDER_REVIEW) &&
                          currentTime > g.slaDeadline;

                        return (
                          <tr
                            key={g.id}
                            className={`hover:bg-slate-50/70 transition-colors ${
                              isCompleted ? 'bg-slate-50/30' : ''
                            }`}
                          >
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              #{g.id}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-900 max-w-xs truncate" title={g.title}>
                                {g.title}
                              </div>
                              {isCompleted && (
                                <span className="inline-block mt-0.5 text-[10px] font-semibold text-slate-400">
                                  Historical / Completed
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-600">
                              <a
                                href={getExplorerAddressUrl(chainId, g.citizen)}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-blue-600 hover:underline"
                                title={g.citizen}
                              >
                                {shortenAddress(g.citizen, 4)}
                              </a>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-600">
                              {g.assignedOfficer && g.assignedOfficer !== '0x0000000000000000000000000000000000000000' ? (
                                <a
                                  href={getExplorerAddressUrl(chainId, g.assignedOfficer)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:text-blue-600 hover:underline"
                                  title={g.assignedOfficer}
                                >
                                  {shortenAddress(g.assignedOfficer, 4)}
                                </a>
                              ) : (
                                <span className="text-slate-400 italic">Unassigned</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <Badge variant={sMeta.badgeVariant} dot size="xs">
                                {sMeta.label}
                              </Badge>
                            </td>
                            <td className="py-3.5 px-4">
                              <Badge variant={pMeta.badgeVariant} size="xs">
                                {pMeta.label}
                              </Badge>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600">
                              {isCompleted ? (
                                <span className="text-slate-400 text-[11px]">—</span>
                              ) : isBreached ? (
                                <span className="text-rose-600 font-bold text-[11px]">
                                  Breached
                                </span>
                              ) : (
                                <span className="text-[11px] font-mono">
                                  {formatTimestamp(g.slaDeadline)}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                              {formatTimestamp(g.createdAt)}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  onClick={() => openInspectModal(g)}
                                  className="font-semibold"
                                >
                                  Inspect Case
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => navigate(`/grievance/${g.id}`)}
                                  className="font-medium text-slate-600 hover:text-blue-600"
                                >
                                  View ↗
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
            </div>
          </Card>
        </div>
      )}

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
                <table className="w-full text-left text-xs min-w-[640px]">
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
            subtitle="Real-time monitoring of deterministic on-chain resolution deadlines for this department"
          >
            <div className="space-y-4">
              {/* SLA Sub-filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-slate-100">
                {[
                  { id: 'all', label: 'All SLA Cases', count: deptGrievances.length },
                  { id: 'active', label: 'Active On-Track', count: activeSlaCases.length },
                  { id: 'breached', label: 'Overdue / Breached', count: overdueCases.length },
                  { id: 'escalated', label: 'Formally Escalated', count: formallyEscalatedCases.length },
                  { id: 'approaching', label: 'Approaching Deadline (≤24h)', count: approachingDeadlineCases.length },
                  { id: 'completed', label: 'Completed Cases', count: completedSlaCases.length },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSlaFilter(st.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      slaFilter === st.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {st.label} ({st.count})
                  </button>
                ))}
              </div>

              {(() => {
                const listToDisplay =
                  slaFilter === 'active'
                    ? activeSlaCases
                    : slaFilter === 'breached'
                    ? overdueCases
                    : slaFilter === 'escalated'
                    ? formallyEscalatedCases
                    : slaFilter === 'approaching'
                    ? approachingDeadlineCases
                    : slaFilter === 'completed'
                    ? completedSlaCases
                    : deptGrievances;

                if (listToDisplay.length === 0) {
                  return (
                    <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No cases found in the selected SLA filter category.
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {listToDisplay.map((g) => {
                      const isBreached =
                        currentTime > g.slaDeadline &&
                        ![STATUSES.ACCEPTED, STATUSES.CLOSED, STATUSES.REJECTED].includes(g.status);
                      const isCompleted = [STATUSES.ACCEPTED, STATUSES.CLOSED, STATUSES.REJECTED].includes(g.status);

                      return (
                        <div
                          key={g.id}
                          className={`p-4 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${
                            g.status === STATUSES.ESCALATED
                              ? 'bg-rose-50/70 border-rose-300'
                              : isBreached
                              ? 'bg-amber-50/60 border-amber-300'
                              : isCompleted
                              ? 'bg-slate-50/60 border-slate-200'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900">#{g.id}</span>
                              {g.status === STATUSES.ESCALATED ? (
                                <Badge variant="danger" dot>FORMALLY ESCALATED</Badge>
                              ) : isBreached ? (
                                <Badge variant="danger" dot>SLA BREACHED</Badge>
                              ) : isCompleted ? (
                                <Badge variant="default">COMPLETED</Badge>
                              ) : (
                                <Badge variant="success" dot>ON-TRACK</Badge>
                              )}
                              <Badge variant={PRIORITY_METADATA[g.priority]?.badgeVariant} size="xs">
                                {PRIORITY_METADATA[g.priority]?.label}
                              </Badge>
                            </div>
                            <h4 className="font-bold text-slate-900 text-sm mt-1">{g.title}</h4>
                            <div className="text-[11px] text-slate-500 font-mono mt-1 flex flex-wrap items-center gap-2">
                              <span>SLA Deadline: {formatTimestamp(g.slaDeadline)}</span>
                              <span>•</span>
                              <span>
                                Officer: {g.assignedOfficer && g.assignedOfficer !== '0x0000000000000000000000000000000000000000'
                                  ? shortenAddress(g.assignedOfficer, 5)
                                  : 'Unassigned'}
                              </span>
                              {isBreached && (
                                <>
                                  <span>•</span>
                                  <span className="text-rose-600 font-bold">
                                    Overdue by {Math.floor((currentTime - g.slaDeadline) / 3600)}h
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
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
                            ) : isBreached ? (
                              <Button
                                size="xs"
                                variant="danger"
                                loading={actionLoading === `esc_${g.id}`}
                                onClick={() => handleTriggerEscalate(g.id)}
                                className="font-bold"
                              >
                                Trigger Escalation
                              </Button>
                            ) : null}
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => openInspectModal(g)}
                            >
                              Inspect Case
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
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
                <table className="w-full text-left text-xs min-w-[560px]">
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
                                const otherDept = allSystemDepartments.find((d) => d.id !== selectedDeptId && d.isActive);
                                setTransferTargetDeptId(otherDept ? String(otherDept.id) : '');
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

      {/* 5. CATEGORIES SECTION */}
      {activeSection === 'categories' && (
        <div className="space-y-6 animate-fade-in">
          {categorySuccessDetails && (
            <div className="p-5 bg-emerald-50 border border-emerald-200/90 rounded-2xl space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">✓</span>
                  Category created successfully.
                </div>
                <button
                  type="button"
                  onClick={() => setCategorySuccessDetails(null)}
                  className="text-xs text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-emerald-800">
                {categorySuccessDetails.id && (
                  <div>
                    <span className="font-semibold text-emerald-950">Category ID:</span> #{categorySuccessDetails.id}
                  </div>
                )}
                <div>
                  <span className="font-semibold text-emerald-950">Category Name:</span> {categorySuccessDetails.name}
                </div>
                <div>
                  <span className="font-semibold text-emerald-950">Department:</span> {categorySuccessDetails.department} (#{categorySuccessDetails.departmentId})
                </div>
                {categorySuccessDetails.txHash && (
                  <div className="sm:col-span-2 font-mono text-[11px] pt-1 border-t border-emerald-200/60">
                    <span className="font-sans font-semibold text-emerald-950">Transaction Hash: </span>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${categorySuccessDetails.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 hover:text-emerald-950 underline font-bold"
                    >
                      {categorySuccessDetails.txHash} ↗ (Sepolia Etherscan)
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          <Card
            title="Department Grievance Categories"
            subtitle={`Manage authoritative categories for ${selectedDept?.name || 'this department'}`}
            headerAction={
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryName('');
                  setCategoryDesc('');
                  setError(null);
                  setShowCategoryModal(true);
                }}
                className="font-bold flex items-center gap-1.5"
              >
                + Add Category
              </Button>
            }
          >
            {deptCategories.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs space-y-3">
                <p className="text-slate-400">No categories registered for this department yet.</p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditingCategory(null);
                    setCategoryName('');
                    setCategoryDesc('');
                    setShowCategoryModal(true);
                  }}
                  className="font-bold inline-flex items-center gap-1.5 mx-auto"
                >
                  + Add Category
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                <table className="w-full text-left text-xs min-w-[640px]">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Category Name</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Created</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deptCategories.map((cat) => (
                      <tr key={cat.id} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-600">
                          #{cat.id}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {cat.name}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">
                          {cat.description || '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant={cat.isActive ? 'success' : 'default'} size="xs">
                            {cat.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                          {formatTimestamp(cat.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                setEditingCategory(cat);
                                setCategoryName(cat.name);
                                setCategoryDesc(cat.description || '');
                                setShowCategoryModal(true);
                              }}
                              disabled={Boolean(actionLoading)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant={cat.isActive ? 'secondary' : 'primary'}
                              size="xs"
                              loading={actionLoading === `toggle_cat_${cat.id}`}
                              onClick={async () => {
                                try {
                                  setActionLoading(`toggle_cat_${cat.id}`);
                                  setError(null);
                                  setSuccessMsg('');
                                  if (cat.isActive) {
                                    await deactivateCategory(signer, cat.id);
                                    setSuccessMsg(`Category "${cat.name}" deactivated.`);
                                  } else {
                                    await reactivateCategory(signer, cat.id);
                                    setSuccessMsg(`Category "${cat.name}" reactivated.`);
                                  }
                                  await loadDeptData();
                                } catch (err) {
                                  setError(err.message || 'Failed to update category status.');
                                } finally {
                                  setActionLoading('');
                                }
                              }}
                              className="font-medium"
                            >
                              {cat.isActive ? 'Deactivate' : 'Reactivate'}
                            </Button>
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

      {/* 6. DEPARTMENT AUDIT TRAIL */}
      {activeSection === 'audit' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="Department Immutable Audit Ledger"
            subtitle={`On-chain cryptographic audit trail recorded by AuditTrail for ${selectedDept?.name || 'this department'}`}
            action={
              <Button
                variant="secondary"
                size="xs"
                onClick={loadDeptData}
                loading={loadingAudits}
                className="font-semibold"
              >
                Refresh Ledger
              </Button>
            }
          >
            {loadingAudits ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Querying verified audit records from Sepolia blockchain...
              </div>
            ) : deptAuditsList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No on-chain audit records indexed for this department yet.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                <table className="w-full text-left text-xs min-w-[640px]">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Audit ID</th>
                      <th className="py-3 px-4">Lifecycle Action</th>
                      <th className="py-3 px-4">Target</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Details Hash</th>
                      <th className="py-3 px-4 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deptAuditsList.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          #{a.id}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="primary" dot size="xs">
                            {a.actionName}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                          {a.targetId === selectedDeptId ? `Dept #${a.targetId}` : `Grievance #${a.targetId}`}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          <a
                            href={getExplorerAddressUrl(chainId, a.actor)}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-blue-600 hover:underline"
                            title={a.actor}
                          >
                            {shortenAddress(a.actor, 5)}
                          </a>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400 truncate max-w-xs" title={a.detailsHash}>
                          {a.detailsHash && a.detailsHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'
                            ? shortenAddress(a.detailsHash, 8)
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-500 font-mono text-[11px]">
                          {formatTimestamp(a.timestamp)}
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

      {/* Comprehensive Case Inspection Modal */}
      <Modal
        isOpen={Boolean(inspectingCase)}
        onClose={() => setInspectingCase(null)}
        title={`Case Management: Grievance #${inspectingCase?.id}`}
        subtitle={inspectingCase?.title}
      >
        {inspectingCase && (
          <div className="space-y-5 text-xs">
            {/* Historical / Closed Banner */}
            {(inspectingCase.status === STATUSES.ACCEPTED || inspectingCase.status === STATUSES.CLOSED) && (
              <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-2xl flex items-center gap-2.5 text-slate-700">
                <span className="font-bold text-sm">✓</span>
                <div>
                  <div className="font-bold">Historical / Closed Case</div>
                  <div className="text-[11px] text-slate-500">
                    This grievance has been concluded. Its lifecycle and resolutions are permanently immutable on Ethereum Sepolia.
                  </div>
                </div>
              </div>
            )}

            {inspectingCase.status === STATUSES.REJECTED && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-800">
                <span className="font-bold text-sm">✕</span>
                <div>
                  <div className="font-bold">Administratively Rejected</div>
                  <div className="text-[11px] text-rose-600">
                    This grievance was determined to be invalid or out of jurisdiction and closed.
                  </div>
                </div>
              </div>
            )}

            {/* Core Attributes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                <Badge variant={STATUS_METADATA[inspectingCase.status]?.badgeVariant} dot size="xs" className="mt-1">
                  {STATUS_METADATA[inspectingCase.status]?.label}
                </Badge>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Priority</span>
                <Badge variant={PRIORITY_METADATA[inspectingCase.priority]?.badgeVariant} size="xs" className="mt-1">
                  {PRIORITY_METADATA[inspectingCase.priority]?.label}
                </Badge>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Department</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {selectedDept?.name || `#${inspectingCase.departmentId}`}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">SLA Target</span>
                <span className={`font-mono text-[11px] mt-1 block ${
                  currentTime > inspectingCase.slaDeadline && ![STATUSES.ACCEPTED, STATUSES.CLOSED, STATUSES.REJECTED].includes(inspectingCase.status)
                    ? 'text-rose-600 font-bold'
                    : 'text-slate-700'
                }`}>
                  {formatTimestamp(inspectingCase.slaDeadline)}
                </span>
              </div>
            </div>

            {/* Parties */}
            <div className="space-y-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Citizen:</span>
                <a
                  href={getExplorerAddressUrl(chainId, inspectingCase.citizen)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-blue-600 hover:underline font-semibold"
                >
                  {inspectingCase.citizen} ↗
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Assigned Officer:</span>
                {inspectingCase.assignedOfficer && inspectingCase.assignedOfficer !== '0x0000000000000000000000000000000000000000' ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={getExplorerAddressUrl(chainId, inspectingCase.assignedOfficer)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-blue-600 hover:underline font-semibold"
                    >
                      {shortenAddress(inspectingCase.assignedOfficer, 6)} ↗
                    </a>
                    {![STATUSES.ACCEPTED, STATUSES.CLOSED, STATUSES.REJECTED].includes(inspectingCase.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          setReassignTarget(inspectingCase);
                          setNewOfficerForReassign(deptOfficers.find((o) => o.toLowerCase() !== inspectingCase.assignedOfficer.toLowerCase()) || '');
                          setReassignReason('');
                        }}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                      >
                        Reassign
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400 italic">Unassigned</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Created Date:</span>
                <span className="font-mono text-slate-700">{formatTimestamp(inspectingCase.createdAt)}</span>
              </div>
            </div>

            {/* IPFS Description & CID */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">IPFS Metadata Reference</span>
                {inspectingCase.descriptionCid && (
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${inspectingCase.descriptionCid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline font-mono text-[11px]"
                  >
                    View on Pinata Gateway ↗
                  </a>
                )}
              </div>
              <div className="font-mono text-[11px] text-slate-500 truncate" title={inspectingCase.descriptionCid}>
                CID: {inspectingCase.descriptionCid || 'None'}
              </div>
              <div className="font-mono text-[11px] text-slate-400 truncate" title={inspectingCase.descriptionHash}>
                Keccak-256: {inspectingCase.descriptionHash || 'None'}
              </div>
            </div>

            {/* Specific Case Audits */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Case Audit Trail ({caseAudits.length})</span>
                {loadingCaseAudits && (
                  <span className="text-[10px] text-slate-400">Loading verified events...</span>
                )}
              </div>
              {caseAudits.length === 0 ? (
                <div className="py-4 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  {loadingCaseAudits ? 'Loading audit trail...' : 'No target audit events recorded for this case.'}
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {caseAudits.map((ca) => (
                    <div
                      key={ca.id}
                      className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="primary" size="xs">
                          {ca.actionName}
                        </Badge>
                        <span className="text-slate-500 font-mono">
                          by {shortenAddress(ca.actor, 4)}
                        </span>
                      </div>
                      <span className="text-slate-400 font-mono">
                        {formatTimestamp(ca.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setInspectingCase(null)}
              >
                Close
              </Button>

              <div className="flex items-center gap-2">
                {inspectingCase.status === STATUSES.SUBMITTED && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === `reg_${inspectingCase.id}`}
                    onClick={() => {
                      handleRegisterGrievance(inspectingCase.id);
                      setInspectingCase(null);
                    }}
                    className="font-bold"
                  >
                    Formally Register
                  </Button>
                )}

                {inspectingCase.status === STATUSES.REGISTERED && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setAssignTargetGrievance(inspectingCase);
                      setSelectedOfficerForAssign(deptOfficers[0] || '');
                      setInspectingCase(null);
                    }}
                    disabled={deptOfficers.length === 0}
                    className="font-bold"
                  >
                    Assign Officer
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    navigate(`/grievance/${inspectingCase.id}`);
                    setInspectingCase(null);
                  }}
                  className="font-bold"
                >
                  Open Full Case Page ↗
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

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
              {allSystemDepartments
                .filter((d) => d.id !== selectedDeptId && d.isActive)
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

      {/* Add / Edit Category Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setEditingCategory(null);
        }}
        title={editingCategory ? `Edit Category #${editingCategory.id}` : 'Create Department Category'}
        subtitle={
          editingCategory
            ? 'Update category name and coverage scope'
            : `Authoritative category for ${selectedDept?.name || 'Department'} (#${selectedDeptId})`
        }
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!categoryName.trim()) {
              setError('Category name is required.');
              return;
            }

            try {
              setActionLoading('save_category');
              setError(null);
              setSuccessMsg('');
              setCategorySuccessDetails(null);

              if (!editingCategory) {
                // Pre-flight read-only validation check before triggering MetaMask
                const preflight = await validateCategoryCreationPreflight(runner, {
                  callerAddress: address,
                  chainId,
                  departmentId: selectedDeptId,
                  categoryName: categoryName.trim(),
                });

                if (!preflight.valid) {
                  setError(preflight.error);
                  return;
                }
              }

              if (editingCategory) {
                await updateCategory(signer, editingCategory.id, categoryName.trim(), categoryDesc.trim());
                setSuccessMsg(`Category "${categoryName.trim()}" updated successfully.`);
              } else {
                const receipt = await createCategory(signer, selectedDeptId, categoryName.trim(), categoryDesc.trim());
                
                // Determine new category count / ID if available
                let newCatId = null;
                try {
                  const depts = await fetchDepartmentCategories(runner, selectedDeptId);
                  const matching = depts.find((c) => c.name.toLowerCase() === categoryName.trim().toLowerCase());
                  if (matching) newCatId = matching.id;
                } catch {}

                setCategorySuccessDetails({
                  id: newCatId,
                  name: categoryName.trim(),
                  department: selectedDept?.name || 'Public Works and Infrastructure',
                  departmentId: selectedDeptId,
                  txHash: receipt?.hash,
                });
                setSuccessMsg('Category created successfully.');
              }
              setShowCategoryModal(false);
              setEditingCategory(null);
              setCategoryName('');
              setCategoryDesc('');
              await loadDeptData();
            } catch (err) {
              setError(err.message || 'Category creation failed.');
            } finally {
              setActionLoading('');
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Department
            </label>
            <input
              type="text"
              readOnly
              disabled
              value={selectedDept?.name || 'Public Works and Infrastructure'}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 font-semibold cursor-not-allowed outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Department ID
            </label>
            <input
              type="text"
              readOnly
              disabled
              value={`#${selectedDeptId || 1}`}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 font-mono font-semibold cursor-not-allowed outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Category Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Road Maintenance, Water Contamination"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description (optional)
            </label>
            <textarea
              rows={3}
              placeholder="Brief explanation of grievances covered by this category"
              value={categoryDesc}
              onChange={(e) => setCategoryDesc(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none resize-none"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowCategoryModal(false);
                setEditingCategory(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={actionLoading === 'save_category'}
              className="font-bold"
            >
              {editingCategory ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
