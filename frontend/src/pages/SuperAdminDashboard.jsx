import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRoles } from '../hooks/useRoles';
import { useRouter } from '../hooks/useRouter';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import {
  formatTimestamp,
  shortenAddress,
  getExplorerAddressUrl,
  getExplorerTxUrl,
  isValidAddress,
} from '../utils/formatters';

import {
  fetchAllDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
  reactivateDepartment,
  setDepartmentAdmin,
  removeDepartmentAdmin,
  fetchAllCategories,
  fetchDepartmentOfficers,
  fetchEligibleDepartmentAdmins,
  validateDepartmentCreationPreflight,
} from '../services/departmentService';
import { getRoleManagerContract } from '../services/blockchain';

import {
  PRIORITIES,
  PRIORITY_METADATA,
  STATUSES,
  STATUS_METADATA,
  fetchSlaDurations,
  updateSlaDuration,
  fetchAllGrievances,
} from '../services/grievanceService';

import {
  grantOfficerRole,
  revokeOfficerRole,
  grantDepartmentAdminRole,
  revokeDepartmentAdminRole,
  grantSuperAdminRole,
  revokeSuperAdminRole,
  fetchSuperAdminCount,
} from '../services/adminRoleService';

import { fetchUserRoles } from '../services/roleService';

import {
  resolveEscalation,
} from '../services/escalationService';

import {
  fetchAuditCount,
  fetchAuditEntriesRange,
  fetchAuditsByTarget,
  fetchAuditsByActor,
  AUDIT_ACTION_NAMES,
} from '../services/auditService';

import { fetchFromIpfs } from '../services/ipfs';
import { ContractStatusCard } from '../components/blockchain/ContractStatusCard';
import { CONTRACT_ADDRESSES } from '../contracts/addresses';

export function SuperAdminDashboard() {
  const { address, signer, provider, chainId, isConnected } = useWallet();
  const { isSuperAdmin, superAdminCount: contextAdminCount } = useRoles();
  const { navigate } = useRouter();

  const runner = provider || signer;

  // Active navigation tab
  const [activeTab, setActiveTab] = useState('departments');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Transaction Status State (UX: Before -> During -> Success -> Failure)
  const [txStatus, setTxStatus] = useState({
    state: 'idle', // 'idle' | 'awaiting_signature' | 'mining' | 'success' | 'error'
    message: '',
    txHash: '',
    error: '',
  });

  // =========================================================================
  // 0. ACCOUNT SWITCHING & STATE INVALIDATION (Zero Stale Data Leakage)
  // =========================================================================
  useEffect(() => {
    setDepartments([]);
    setAllGrievances([]);
    setCategories([]);
    setGlobalOfficers([]);
    setAuditEntries([]);
    setInspectedGrievance(null);
    setInspectedRoles(null);
    setInspectAddress('');
    setTxStatus({ state: 'idle', message: '', txHash: '', error: '' });
    setError(null);
    setSuccessMsg('');
  }, [address, chainId]);

  // =========================================================================
  // 1. GLOBAL STATE COLLECTIONS
  // =========================================================================
  const [departments, setDepartments] = useState([]);
  const [allGrievances, setAllGrievances] = useState([]);
  const [categories, setCategories] = useState([]);
  const [globalOfficers, setGlobalOfficers] = useState([]);
  const [slaDurations, setSlaDurations] = useState([]);
  const [liveAdminCount, setLiveAdminCount] = useState(contextAdminCount || 1);

  // Filter & Search States
  const [deptSearch, setDeptSearch] = useState('');
  const [grievanceSearch, setGrievanceSearch] = useState('');
  const [grievanceStatusFilter, setGrievanceStatusFilter] = useState('all');
  const [grievanceDeptFilter, setGrievanceDeptFilter] = useState('all');
  const [grievanceCatFilter, setGrievanceCatFilter] = useState('all');
  const [grievanceOfficerFilter, setGrievanceOfficerFilter] = useState('all');
  const [grievancePriorityFilter, setGrievancePriorityFilter] = useState('all');

  const [officerSearch, setOfficerSearch] = useState('');
  const [officerDeptFilter, setOfficerDeptFilter] = useState('all');

  const [catSearch, setCatSearch] = useState('');
  const [catDeptFilter, setCatDeptFilter] = useState('all');

  const [slaDeptFilter, setSlaDeptFilter] = useState('all');

  // Case Inspection Modal State
  const [inspectedGrievance, setInspectedGrievance] = useState(null);
  const [caseAudits, setCaseAudits] = useState([]);
  const [caseAuditsLoading, setCaseAuditsLoading] = useState(false);
  const [caseIpfsContent, setCaseIpfsContent] = useState('');
  const [caseIpfsLoading, setCaseIpfsLoading] = useState(false);

  // Department Management Modals
  const [showCreateDeptModal, setShowCreateDeptModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptAdmin, setNewDeptAdmin] = useState('');
  const [eligibleAdmins, setEligibleAdmins] = useState([]);

  const [editingDept, setEditingDept] = useState(null);
  const [editDeptName, setEditDeptName] = useState('');

  const [changingAdminDept, setChangingAdminDept] = useState(null);
  const [newAdminAddr, setNewAdminAddr] = useState('');
  const [changeAdminRoleStatus, setChangeAdminRoleStatus] = useState('idle');
  const [isGrantingChangeAdminRole, setIsGrantingChangeAdminRole] = useState(false);

  const [confirmDeactivateDept, setConfirmDeactivateDept] = useState(null);
  const [confirmReactivateDept, setConfirmReactivateDept] = useState(null);
  const [confirmRemoveAdmin, setConfirmRemoveAdmin] = useState(null);

  // Live Role Verification for Create/Change Department Admin
  const [adminRoleStatus, setAdminRoleStatus] = useState('idle'); // 'idle' | 'checking' | 'has_role' | 'missing_role' | 'invalid_address'
  const [isGrantingRole, setIsGrantingRole] = useState(false);

  const checkAdminRole = useCallback(
    async (addr) => {
      if (!addr || !addr.trim()) {
        setAdminRoleStatus('idle');
        return;
      }
      const trimmed = addr.trim();
      if (!isValidAddress(trimmed)) {
        setAdminRoleStatus('invalid_address');
        return;
      }
      setAdminRoleStatus('checking');
      try {
        const contract = getRoleManagerContract(runner);
        const hasDeptAdmin = await contract.isDepartmentAdmin(trimmed);
        setAdminRoleStatus(hasDeptAdmin ? 'has_role' : 'missing_role');
      } catch (err) {
        console.warn('Failed to verify admin role on-chain:', err);
        setAdminRoleStatus('idle');
      }
    },
    [runner]
  );

  useEffect(() => {
    if (newDeptAdmin) {
      checkAdminRole(newDeptAdmin);
    } else {
      setAdminRoleStatus('idle');
    }
  }, [newDeptAdmin, checkAdminRole]);

  const checkChangeAdminRole = useCallback(
    async (addr) => {
      if (!addr || !addr.trim()) {
        setChangeAdminRoleStatus('idle');
        return;
      }
      const trimmed = addr.trim();
      if (!isValidAddress(trimmed)) {
        setChangeAdminRoleStatus('invalid_address');
        return;
      }
      setChangeAdminRoleStatus('checking');
      try {
        const contract = getRoleManagerContract(runner);
        const hasDeptAdmin = await contract.isDepartmentAdmin(trimmed);
        setChangeAdminRoleStatus(hasDeptAdmin ? 'has_role' : 'missing_role');
      } catch (err) {
        console.warn('Failed to verify change admin role on-chain:', err);
        setChangeAdminRoleStatus('idle');
      }
    },
    [runner]
  );

  useEffect(() => {
    if (newAdminAddr) {
      checkChangeAdminRole(newAdminAddr);
    } else {
      setChangeAdminRoleStatus('idle');
    }
  }, [newAdminAddr, checkChangeAdminRole]);

  const handleGrantRoleForNewDept = async () => {
    const targetAddr = newDeptAdmin.trim();
    if (!isValidAddress(targetAddr)) return;
    setIsGrantingRole(true);
    try {
      await executeTx(`Grant Department Admin to ${shortenAddress(targetAddr)}`, async () => {
        setTxStatus((prev) => ({
          ...prev,
          state: 'mining',
          message: 'Granting DEPARTMENT_ADMIN_ROLE on-chain...',
        }));
        return await grantDepartmentAdminRole(signer, targetAddr);
      });
      await checkAdminRole(targetAddr);
      const updatedEligible = await fetchEligibleDepartmentAdmins(runner);
      setEligibleAdmins(updatedEligible);
    } catch (err) {
      console.error('Failed to grant department admin role:', err);
    } finally {
      setIsGrantingRole(false);
    }
  };

  const handleGrantRoleForChangeDept = async () => {
    const targetAddr = newAdminAddr.trim();
    if (!isValidAddress(targetAddr)) return;
    setIsGrantingChangeAdminRole(true);
    try {
      await executeTx(`Grant Department Admin to ${shortenAddress(targetAddr)}`, async () => {
        setTxStatus((prev) => ({
          ...prev,
          state: 'mining',
          message: 'Granting DEPARTMENT_ADMIN_ROLE on-chain...',
        }));
        return await grantDepartmentAdminRole(signer, targetAddr);
      });
      await checkChangeAdminRole(targetAddr);
      const updatedEligible = await fetchEligibleDepartmentAdmins(runner);
      setEligibleAdmins(updatedEligible);
    } catch (err) {
      console.error('Failed to grant department admin role:', err);
    } finally {
      setIsGrantingChangeAdminRole(false);
    }
  };

  // SLA Configuration State
  const [selectedPriorityForSla, setSelectedPriorityForSla] = useState(PRIORITIES.LOW);
  const [newSlaDays, setNewSlaDays] = useState('14');

  // RBAC & Emergency Governance State
  const [inspectAddress, setInspectAddress] = useState('');
  const [inspectedRoles, setInspectedRoles] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [confirmRoleAction, setConfirmRoleAction] = useState(null);
  const [confirmResolveEscalation, setConfirmResolveEscalation] = useState(null);

  // Audit Log Inspector State
  const [totalAudits, setTotalAudits] = useState(0);
  const [auditEntries, setAuditEntries] = useState([]);
  const [searchTargetId, setSearchTargetId] = useState('');
  const [searchActorAddr, setSearchActorAddr] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');

  // System Configuration IPFS Health State
  const [ipfsHealth, setIpfsHealth] = useState({ checked: false, configured: false, gateway: '' });

  // Current block time for SLA countdown calculation
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 15000);
    return () => clearInterval(timer);
  }, []);

  // =========================================================================
  // 2. DATA INGESTION ORCHESTRATION
  // =========================================================================
  const loadGlobalData = useCallback(async () => {
    if (!runner || !isSuperAdmin) return;
    try {
      setLoading(true);

      // 1. Fetch departments, grievances, categories, SLAs, admin count, and eligible department admins concurrently
      const [deptsRaw, grievancesRaw, catsRaw, slaRaw, adminCountRaw, auditCountRaw, eligibleAdminsRaw] =
        await Promise.all([
          fetchAllDepartments(runner).catch(() => []),
          fetchAllGrievances(runner, 200).catch(() => []),
          fetchAllCategories(runner).catch(() => []),
          fetchSlaDurations(runner).catch(() => []),
          fetchSuperAdminCount(runner).catch(() => 1),
          fetchAuditCount(runner).catch(() => 0),
          fetchEligibleDepartmentAdmins(runner).catch(() => []),
        ]);

      setAllGrievances(grievancesRaw);
      setCategories(catsRaw);
      setSlaDurations(slaRaw);
      setLiveAdminCount(adminCountRaw);
      setTotalAudits(auditCountRaw);
      setEligibleAdmins(eligibleAdminsRaw);

      // 2. Fetch department officers for every department to build global officer directory
      const officerMap = new Map();
      const enrichedDepts = await Promise.all(
        deptsRaw.map(async (dept) => {
          let officersInDept = [];
          try {
            officersInDept = await fetchDepartmentOfficers(runner, dept.id);
          } catch {
            officersInDept = [];
          }

          // Register in global officer directory
          officersInDept.forEach((offAddr) => {
            const key = offAddr.toLowerCase();
            if (!officerMap.has(key)) {
              officerMap.set(key, {
                address: offAddr,
                departments: [],
                assignedCount: 0,
                activeWorkload: 0,
                resolvedCount: 0,
              });
            }
            officerMap.get(key).departments.push({
              id: dept.id,
              name: dept.name,
              isActive: dept.isActive,
            });
          });

          // Grievance count for this department
          const deptGrievanceCount = grievancesRaw.filter(
            (g) => Number(g.departmentId) === Number(dept.id)
          ).length;

          return {
            ...dept,
            officerCount: officersInDept.length,
            grievanceCount: deptGrievanceCount,
          };
        })
      );

      setDepartments(enrichedDepts);

      // 3. Cross-reference officers with global grievances for live workloads
      grievancesRaw.forEach((g) => {
        if (g.assignedOfficer && g.assignedOfficer !== '0x0000000000000000000000000000000000000000') {
          const key = g.assignedOfficer.toLowerCase();
          if (officerMap.has(key)) {
            const offRecord = officerMap.get(key);
            offRecord.assignedCount += 1;
            if (
              [
                STATUSES.ASSIGNED,
                STATUSES.UNDER_REVIEW,
                STATUSES.UNDER_INVESTIGATION,
                STATUSES.REOPENED,
              ].includes(g.status)
            ) {
              offRecord.activeWorkload += 1;
            }
            if ([STATUSES.ACCEPTED, STATUSES.CLOSED].includes(g.status)) {
              offRecord.resolvedCount += 1;
            }
          }
        }
      });

      setGlobalOfficers(Array.from(officerMap.values()));

      // 4. Initial audit entries (latest 40 records)
      if (auditCountRaw > 0) {
        const start = Math.max(1, auditCountRaw - 39);
        const entries = await fetchAuditEntriesRange(runner, start, auditCountRaw).catch(() => []);
        setAuditEntries(entries.reverse());
      } else {
        setAuditEntries([]);
      }
    } catch (err) {
      console.error('Failed to load global governance data:', err);
    } finally {
      setLoading(false);
    }
  }, [runner, isSuperAdmin]);

  useEffect(() => {
    let active = true;
    if (active && isSuperAdmin && runner) {
      loadGlobalData();
    }
    return () => {
      active = false;
    };
  }, [loadGlobalData, isSuperAdmin, runner]);

  // Ping backend IPFS status on mount
  useEffect(() => {
    const checkIpfs = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/ipfs/status');
        if (res.ok) {
          const data = await res.json();
          setIpfsHealth({ checked: true, configured: data.configured, gateway: data.gateway });
        } else {
          setIpfsHealth({ checked: true, configured: false, gateway: 'Unavailable' });
        }
      } catch {
        setIpfsHealth({ checked: true, configured: false, gateway: 'Offline' });
      }
    };
    checkIpfs();
  }, []);

  // =========================================================================
  // 3. TOP SUMMARY METRICS (Global Across All Departments)
  // =========================================================================
  const globalMetrics = useMemo(() => {
    const totalDepts = departments.length;
    const activeDepts = departments.filter((d) => d.isActive).length;
    const totalGrievances = allGrievances.length;

    const pending = allGrievances.filter(
      (g) => g.status === STATUSES.SUBMITTED || g.status === STATUSES.REGISTERED
    ).length;

    const investigations = allGrievances.filter(
      (g) =>
        g.status === STATUSES.UNDER_REVIEW ||
        g.status === STATUSES.UNDER_INVESTIGATION ||
        g.status === STATUSES.REOPENED
    ).length;

    const resolutions = allGrievances.filter(
      (g) => g.status === STATUSES.RESOLUTION_PROPOSED || g.status === STATUSES.CITIZEN_REVIEW
    ).length;

    const resolved = allGrievances.filter((g) => g.status === STATUSES.ACCEPTED).length;
    const rejected = allGrievances.filter((g) => g.status === STATUSES.REJECTED).length;
    const reopened = allGrievances.filter((g) => g.status === STATUSES.REOPENED).length;
    const closed = allGrievances.filter((g) => g.status === STATUSES.CLOSED).length;

    const activeOfficersCount = globalOfficers.length;

    // Unique active assigned department admins
    const uniqueAdmins = new Set(
      departments
        .filter((d) => d.isActive && d.admin && d.admin !== '0x0000000000000000000000000000000000000000')
        .map((d) => d.admin.toLowerCase())
    );
    const activeDeptAdminsCount = uniqueAdmins.size;

    const slaEscalations = allGrievances.filter(
      (g) =>
        g.status === STATUSES.ESCALATED ||
        ([STATUSES.UNDER_REVIEW, STATUSES.UNDER_INVESTIGATION].includes(g.status) &&
          currentTime > g.slaDeadline)
    ).length;

    return {
      totalDepts,
      activeDepts,
      totalGrievances,
      pending,
      investigations,
      resolutions,
      resolved,
      rejected,
      reopened,
      closed,
      activeOfficersCount,
      activeDeptAdminsCount,
      slaEscalations,
    };
  }, [departments, allGrievances, globalOfficers, currentTime]);

  // Department name lookup map
  const deptMap = useMemo(() => {
    const map = {};
    departments.forEach((d) => {
      map[d.id] = d.name;
    });
    return map;
  }, [departments]);

  // Category name lookup map
  const catMap = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [categories]);

  // =========================================================================
  // 4. FILTERED DATASETS
  // =========================================================================

  // Filtered Departments
  const filteredDepartments = useMemo(() => {
    if (!deptSearch.trim()) return departments;
    const q = deptSearch.toLowerCase();
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        String(d.id).includes(q) ||
        (d.admin && d.admin.toLowerCase().includes(q))
    );
  }, [departments, deptSearch]);

  // Filtered Global Grievances
  const filteredGrievances = useMemo(() => {
    return allGrievances.filter((g) => {
      // 1. Status Filter
      if (
        grievanceStatusFilter === 'pending' &&
        !(g.status === STATUSES.SUBMITTED || g.status === STATUSES.REGISTERED)
      ) {
        return false;
      }
      if (
        grievanceStatusFilter === 'investigating' &&
        !(
          g.status === STATUSES.UNDER_REVIEW ||
          g.status === STATUSES.UNDER_INVESTIGATION ||
          g.status === STATUSES.REOPENED
        )
      ) {
        return false;
      }
      if (
        grievanceStatusFilter === 'resolution' &&
        !(g.status === STATUSES.RESOLUTION_PROPOSED || g.status === STATUSES.CITIZEN_REVIEW)
      ) {
        return false;
      }
      if (grievanceStatusFilter === 'resolved' && g.status !== STATUSES.ACCEPTED) return false;
      if (grievanceStatusFilter === 'rejected' && g.status !== STATUSES.REJECTED) return false;
      if (grievanceStatusFilter === 'reopened' && g.status !== STATUSES.REOPENED) return false;
      if (grievanceStatusFilter === 'closed' && g.status !== STATUSES.CLOSED) return false;
      if (grievanceStatusFilter === 'escalated' && g.status !== STATUSES.ESCALATED) return false;

      // 2. Department Filter
      if (grievanceDeptFilter !== 'all' && Number(g.departmentId) !== Number(grievanceDeptFilter)) {
        return false;
      }

      // 3. Category Filter
      if (grievanceCatFilter !== 'all' && Number(g.categoryId) !== Number(grievanceCatFilter)) {
        return false;
      }

      // 4. Officer Filter
      if (
        grievanceOfficerFilter !== 'all' &&
        g.assignedOfficer?.toLowerCase() !== grievanceOfficerFilter.toLowerCase()
      ) {
        return false;
      }

      // 5. Priority Filter
      if (grievancePriorityFilter !== 'all' && Number(g.priority) !== Number(grievancePriorityFilter)) {
        return false;
      }

      // 6. Search Query (ID, Title, Citizen, Officer)
      if (grievanceSearch.trim()) {
        const q = grievanceSearch.toLowerCase();
        const matchesId = String(g.id).includes(q);
        const matchesTitle = g.title?.toLowerCase().includes(q);
        const matchesCitizen = g.citizen?.toLowerCase().includes(q);
        const matchesOfficer = g.assignedOfficer?.toLowerCase().includes(q);
        if (!matchesId && !matchesTitle && !matchesCitizen && !matchesOfficer) {
          return false;
        }
      }

      return true;
    });
  }, [
    allGrievances,
    grievanceStatusFilter,
    grievanceDeptFilter,
    grievanceCatFilter,
    grievanceOfficerFilter,
    grievancePriorityFilter,
    grievanceSearch,
  ]);

  // Filtered Officers Directory
  const filteredOfficers = useMemo(() => {
    return globalOfficers.filter((off) => {
      if (officerDeptFilter !== 'all') {
        const inDept = off.departments.some((d) => Number(d.id) === Number(officerDeptFilter));
        if (!inDept) return false;
      }
      if (officerSearch.trim()) {
        const q = officerSearch.toLowerCase();
        const matchesAddr = off.address.toLowerCase().includes(q);
        const matchesDept = off.departments.some((d) => d.name.toLowerCase().includes(q));
        if (!matchesAddr && !matchesDept) return false;
      }
      return true;
    });
  }, [globalOfficers, officerDeptFilter, officerSearch]);

  // Filtered Categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      if (catDeptFilter !== 'all' && Number(c.departmentId) !== Number(catDeptFilter)) {
        return false;
      }
      if (catSearch.trim()) {
        const q = catSearch.toLowerCase();
        const matchesName = c.name?.toLowerCase().includes(q);
        const matchesId = String(c.id).includes(q);
        if (!matchesName && !matchesId) return false;
      }
      return true;
    });
  }, [categories, catDeptFilter, catSearch]);

  // SLA Case Groups
  const slaActiveCases = useMemo(() => {
    return allGrievances.filter(
      (g) =>
        [
          STATUSES.REGISTERED,
          STATUSES.ASSIGNED,
          STATUSES.UNDER_REVIEW,
          STATUSES.UNDER_INVESTIGATION,
          STATUSES.REOPENED,
        ].includes(g.status) && currentTime <= g.slaDeadline
    );
  }, [allGrievances, currentTime]);

  const slaOverdueCases = useMemo(() => {
    return allGrievances.filter(
      (g) =>
        [
          STATUSES.REGISTERED,
          STATUSES.ASSIGNED,
          STATUSES.UNDER_REVIEW,
          STATUSES.UNDER_INVESTIGATION,
          STATUSES.REOPENED,
        ].includes(g.status) && currentTime > g.slaDeadline
    );
  }, [allGrievances, currentTime]);

  const slaEscalatedCases = useMemo(() => {
    return allGrievances.filter((g) => g.status === STATUSES.ESCALATED);
  }, [allGrievances]);

  const slaCompletedCases = useMemo(() => {
    return allGrievances.filter((g) =>
      [STATUSES.ACCEPTED, STATUSES.CLOSED, STATUSES.REJECTED].includes(g.status)
    );
  }, [allGrievances]);

  // Department SLA breakdown
  const departmentSlaBreakdown = useMemo(() => {
    return departments.map((d) => {
      const deptCases = allGrievances.filter((g) => Number(g.departmentId) === Number(d.id));
      const activeInvestigations = deptCases.filter((g) =>
        [STATUSES.UNDER_REVIEW, STATUSES.UNDER_INVESTIGATION, STATUSES.REOPENED].includes(g.status)
      ).length;
      const overdue = deptCases.filter(
        (g) =>
          [STATUSES.UNDER_REVIEW, STATUSES.UNDER_INVESTIGATION, STATUSES.REOPENED].includes(g.status) &&
          currentTime > g.slaDeadline
      ).length;
      const escalated = deptCases.filter((g) => g.status === STATUSES.ESCALATED).length;
      const resolved = deptCases.filter((g) =>
        [STATUSES.ACCEPTED, STATUSES.CLOSED].includes(g.status)
      ).length;

      return {
        id: d.id,
        name: d.name,
        isActive: d.isActive,
        totalCases: deptCases.length,
        activeInvestigations,
        overdue,
        escalated,
        resolved,
      };
    });
  }, [departments, allGrievances, currentTime]);

  // =========================================================================
  // 5. TRANSACTION HANDLERS (Safe Revert Handling + Strict Role UX)
  // =========================================================================

  const executeTx = async (label, txFn) => {
    try {
      setError(null);
      setSuccessMsg('');
      setTxStatus({
        state: 'awaiting_signature',
        message: 'Confirm transaction in MetaMask...',
        txHash: '',
        error: '',
      });

      const receipt = await txFn();

      const hash = receipt?.hash || receipt?.transactionHash || '';
      setTxStatus({
        state: 'success',
        message: `Transaction confirmed on-chain! (${label})`,
        txHash: hash,
        error: '',
      });
      setSuccessMsg(`Success: ${label} was confirmed on Sepolia.`);
      await loadGlobalData();
    } catch (err) {
      console.error(`Transaction failed (${label}):`, err);
      const friendlyErr = err?.reason || err?.message || 'Transaction failed or was rejected.';
      setTxStatus({
        state: 'error',
        message: 'Transaction Failed',
        txHash: '',
        error: friendlyErr,
      });
      setError(friendlyErr);
    }
  };

  // Department Actions
  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptName.trim() || !isValidAddress(newDeptAdmin.trim())) {
      setError('Please provide a valid department name and valid admin address.');
      return;
    }
    if (adminRoleStatus !== 'has_role') {
      setError('Selected wallet must have DEPARTMENT_ADMIN_ROLE before department creation.');
      return;
    }

    // Run read-only preflight simulation
    const preflight = await validateDepartmentCreationPreflight(runner, {
      callerAddress: address,
      chainId,
      name: newDeptName.trim(),
      adminAddress: newDeptAdmin.trim(),
    });
    if (!preflight.valid) {
      setError(preflight.error);
      return;
    }

    await executeTx('Create Department', async () => {
      setTxStatus((prev) => ({ ...prev, state: 'mining', message: 'Deploying department on-chain...' }));
      return await createDepartment(signer, newDeptName.trim(), newDeptAdmin.trim());
    });
    setNewDeptName('');
    setNewDeptAdmin('');
    setShowCreateDeptModal(false);
  };

  const handleUpdateDeptName = async (e) => {
    e.preventDefault();
    if (!editingDept || !editDeptName.trim()) return;
    await executeTx(`Rename Department #${editingDept.id}`, async () => {
      setTxStatus((prev) => ({ ...prev, state: 'mining', message: 'Renaming department on-chain...' }));
      return await updateDepartment(signer, editingDept.id, editDeptName.trim());
    });
    setEditingDept(null);
    setEditDeptName('');
  };

  const handleSetDeptAdmin = async (e) => {
    e.preventDefault();
    if (!changingAdminDept || !isValidAddress(newAdminAddr.trim())) {
      setError('Please enter a valid Ethereum address for Department Admin.');
      return;
    }
    if (changeAdminRoleStatus !== 'has_role') {
      setError('Target wallet must have DEPARTMENT_ADMIN_ROLE before assignment.');
      return;
    }
    await executeTx(`Assign Admin for Dept #${changingAdminDept.id}`, async () => {
      setTxStatus((prev) => ({ ...prev, state: 'mining', message: 'Assigning department admin on-chain...' }));
      return await setDepartmentAdmin(signer, changingAdminDept.id, newAdminAddr.trim());
    });
    setChangingAdminDept(null);
    setNewAdminAddr('');
  };

  const executeRemoveDeptAdmin = async () => {
    if (!confirmRemoveAdmin) return;
    const deptId = confirmRemoveAdmin.id;
    await executeTx(`Remove Admin from Dept #${deptId}`, async () => {
      setTxStatus((prev) => ({ ...prev, state: 'mining', message: 'Removing admin on-chain...' }));
      return await removeDepartmentAdmin(signer, deptId);
    });
    setConfirmRemoveAdmin(null);
  };

  const executeDeactivateDept = async () => {
    if (!confirmDeactivateDept) return;
    const deptId = confirmDeactivateDept.id;
    await executeTx(`Deactivate Department #${deptId}`, async () => {
      setTxStatus((prev) => ({ ...prev, state: 'mining', message: 'Deactivating department on-chain...' }));
      return await deactivateDepartment(signer, deptId);
    });
    setConfirmDeactivateDept(null);
  };

  const executeReactivateDept = async () => {
    if (!confirmReactivateDept) return;
    const deptId = confirmReactivateDept.id;
    await executeTx(`Reactivate Department #${deptId}`, async () => {
      setTxStatus((prev) => ({ ...prev, state: 'mining', message: 'Reactivating department on-chain...' }));
      return await reactivateDepartment(signer, deptId);
    });
    setConfirmReactivateDept(null);
  };

  // SLA Duration Update
  const handleUpdateSla = async (e) => {
    e.preventDefault();
    const days = parseFloat(newSlaDays);
    if (isNaN(days) || days <= 0) {
      setError('Please specify a positive number of days for SLA.');
      return;
    }
    const durationSeconds = Math.round(days * 86400);
    await executeTx(`Update SLA Tier #${selectedPriorityForSla}`, async () => {
      setTxStatus((prev) => ({ ...prev, state: 'mining', message: 'Committing SLA duration on-chain...' }));
      return await updateSlaDuration(signer, Number(selectedPriorityForSla), durationSeconds);
    });
  };

  // Resolve Escalation Action (Super Admin global override)
  const handleResolveEscalationAction = async () => {
    if (!confirmResolveEscalation) return;
    const gId = confirmResolveEscalation.id;
    await executeTx(`Resolve Escalation for Grievance #${gId}`, async () => {
      setTxStatus((prev) => ({ ...prev, state: 'mining', message: 'Resolving escalation on-chain...' }));
      return await resolveEscalation(signer, gId);
    });
    setConfirmResolveEscalation(null);
  };

  // Role Management Action (with last-super-admin check)
  const executeRoleAction = async () => {
    if (!confirmRoleAction) return;
    const { actionFn, label, targetAddr, isSuperAdminRevoke } = confirmRoleAction;

    // Safety check before sending tx
    if (isSuperAdminRevoke && liveAdminCount <= 1) {
      setError('Cannot revoke role: System lockout protection prevents removing the last Super Admin.');
      setConfirmRoleAction(null);
      return;
    }

    await executeTx(label, async () => {
      setTxStatus((prev) => ({ ...prev, state: 'mining', message: `Executing role update on-chain...` }));
      return await actionFn(signer, targetAddr);
    });

    setConfirmRoleAction(null);
    if (inspectAddress.trim()) {
      handleInspectRoles();
    }
  };

  const handleInspectRoles = async (e) => {
    e?.preventDefault();
    if (!isValidAddress(inspectAddress.trim())) {
      setError('Please provide a valid Ethereum wallet address to inspect.');
      return;
    }
    try {
      setInspectLoading(true);
      setError(null);
      const info = await fetchUserRoles(runner, inspectAddress.trim());
      setInspectedRoles(info);
    } catch (err) {
      setError(err.message || 'Failed to inspect user roles.');
    } finally {
      setInspectLoading(false);
    }
  };

  // Forensic Audit Queries
  const handleSearchAuditTarget = async (e) => {
    e.preventDefault();
    if (!searchTargetId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAuditsByTarget(runner, Number(searchTargetId));
      setAuditEntries(res.reverse());
    } catch (err) {
      setError(err.message || 'Target audit query failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchAuditActor = async (e) => {
    e.preventDefault();
    if (!searchActorAddr.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAuditsByActor(runner, searchActorAddr.trim());
      setAuditEntries(res.reverse());
    } catch (err) {
      setError(err.message || 'Actor audit query failed.');
    } finally {
      setLoading(false);
    }
  };

  // Case Inspection Handler
  const handleOpenCaseInspection = async (grievance) => {
    setInspectedGrievance(grievance);
    setCaseAudits([]);
    setCaseIpfsContent('');

    // Fetch case audits from AuditTrail.sol
    setCaseAuditsLoading(true);
    fetchAuditsByTarget(runner, grievance.id)
      .then((records) => setCaseAudits(records.reverse()))
      .catch((err) => console.warn('Case audit fetch failed:', err))
      .finally(() => setCaseAuditsLoading(false));

    // Fetch IPFS description if CID available
    if (grievance.descriptionCid) {
      setCaseIpfsLoading(true);
      fetchFromIpfs(grievance.descriptionCid)
        .then((res) => setCaseIpfsContent(res.content))
        .catch(() => setCaseIpfsContent(''))
        .finally(() => setCaseIpfsLoading(false));
    }
  };

  // =========================================================================
  // 6. ACCESS CONTROL GUARD (Strict Role Separation)
  // =========================================================================
  if (!isConnected) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-slate-100 rounded-3xl mx-auto flex items-center justify-center text-2xl font-bold text-slate-400">
          🔒
        </div>
        <h2 className="text-xl font-extrabold text-slate-900">Wallet Not Connected</h2>
        <p className="text-xs text-slate-500">
          Please connect your MetaMask wallet with authorized Super Admin credentials to access the Global Governance Console.
        </p>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12 space-y-6">
        <div className="p-8 bg-rose-50 border border-rose-200 rounded-3xl text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 bg-rose-100 text-rose-700 rounded-2xl mx-auto flex items-center justify-center text-3xl font-black">
            ✕
          </div>
          <Badge variant="danger" dot className="uppercase font-bold text-xs">
            Access Denied — Strict Role Isolation
          </Badge>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Unauthorized Global Governance Access
          </h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            The connected wallet{' '}
            <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
              {shortenAddress(address, 6)}
            </span>{' '}
            does not hold the <strong className="font-mono text-rose-800">SUPER_ADMIN_ROLE</strong> on Ethereum Sepolia.
          </p>
          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => navigate('/')}>
              Public Portal
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/citizen')}>
              Citizen Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-fade-in pb-16">
      {/* ===================================================================== */}
      {/* LIVE TRANSACTION NOTIFICATION BANNER (Requirement #14)               */}
      {/* ===================================================================== */}
      {txStatus.state !== 'idle' && (
        <div className="transition-all animate-fade-in">
          {txStatus.state === 'awaiting_signature' && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between text-amber-900 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
                <span className="font-bold">Confirm transaction in MetaMask...</span>
                <span className="text-amber-700">Please sign the on-chain governance action.</span>
              </div>
            </div>
          )}

          {txStatus.state === 'mining' && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-center justify-between text-blue-900 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="font-bold">Transaction pending on Ethereum Sepolia...</span>
                <span className="text-blue-700">{txStatus.message}</span>
              </div>
            </div>
          )}

          {txStatus.state === 'success' && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-emerald-900 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-emerald-600 font-black text-sm">✓</span>
                <span className="font-bold">Transaction confirmed on-chain!</span>
                {txStatus.txHash && (
                  <a
                    href={getExplorerTxUrl(txStatus.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-600 underline font-semibold"
                  >
                    View on Etherscan ↗
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => setTxStatus({ state: 'idle', message: '', txHash: '', error: '' })}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {txStatus.state === 'error' && (
            <Alert
              variant="danger"
              title="Transaction Failed"
              onClose={() => setTxStatus({ state: 'idle', message: '', txHash: '', error: '' })}
            >
              {txStatus.error}
            </Alert>
          )}
        </div>
      )}

      {/* Global Alerts */}
      {error && (
        <Alert variant="danger" title="System Notice" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert variant="success" title="Success" onClose={() => setSuccessMsg('')}>
          {successMsg}
        </Alert>
      )}

      {/* ===================================================================== */}
      {/* 1. SUPER ADMIN TOP HEADER                                             */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="danger" dot className="font-bold text-xs uppercase">
                Super Admin Console
              </Badge>
              <span className="text-xs text-slate-400 font-mono">
                Ethereum Sepolia ({chainId})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Global Governance & Protocol Administration
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              System Administrator:{' '}
              <a
                href={getExplorerAddressUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"
              >
                <span className="sm:hidden">{shortenAddress(address, 6)}</span>
                <span className="hidden sm:inline">{address}</span>
                <span className="text-[10px]">↗</span>
              </a>
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5 shrink-0 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <span className="text-xs text-slate-500">
              Active Super Admins On-Chain:{' '}
              <strong className="text-slate-900 font-mono font-bold text-sm">
                {liveAdminCount}
              </strong>
            </span>
            <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
              <span>🛡️</span> Safety Lockout Floor: 1 Administrator
            </span>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 13 TOP-LEVEL GLOBAL SUMMARY CARDS (Requirement #1)                  */}
        {/* =================================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-6 text-xs">
          {/* Card 1 */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-semibold text-[11px]">Total Depts</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {globalMetrics.totalDepts}
            </span>
            <span className="text-[10px] text-slate-400">Registered</span>
          </div>

          {/* Card 2 */}
          <div className="p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-100">
            <span className="text-emerald-700 block font-semibold text-[11px]">Active Depts</span>
            <span className="text-xl font-extrabold text-emerald-800 mt-1 block">
              {globalMetrics.activeDepts}
            </span>
            <span className="text-[10px] text-emerald-600">Operational</span>
          </div>

          {/* Card 3 */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-semibold text-[11px]">Total Cases</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {globalMetrics.totalGrievances}
            </span>
            <span className="text-[10px] text-slate-400">All Time</span>
          </div>

          {/* Card 4 */}
          <div className="p-3.5 bg-blue-50/50 rounded-2xl border border-blue-100">
            <span className="text-blue-700 block font-semibold text-[11px]">Pending Intake</span>
            <span className="text-xl font-extrabold text-blue-800 mt-1 block">
              {globalMetrics.pending}
            </span>
            <span className="text-[10px] text-blue-600">New / Unassigned</span>
          </div>

          {/* Card 5 */}
          <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-100">
            <span className="text-amber-700 block font-semibold text-[11px]">Investigations</span>
            <span className="text-xl font-extrabold text-amber-800 mt-1 block">
              {globalMetrics.investigations}
            </span>
            <span className="text-[10px] text-amber-600">Active Review</span>
          </div>

          {/* Card 6 */}
          <div className="p-3.5 bg-purple-50/50 rounded-2xl border border-purple-100">
            <span className="text-purple-700 block font-semibold text-[11px]">Resolutions</span>
            <span className="text-xl font-extrabold text-purple-800 mt-1 block">
              {globalMetrics.resolutions}
            </span>
            <span className="text-[10px] text-purple-600">Proposed / Review</span>
          </div>

          {/* Card 7 */}
          <div className="p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-100">
            <span className="text-emerald-700 block font-semibold text-[11px]">Resolved</span>
            <span className="text-xl font-extrabold text-emerald-800 mt-1 block">
              {globalMetrics.resolved}
            </span>
            <span className="text-[10px] text-emerald-600">Accepted</span>
          </div>

          {/* Card 8 */}
          <div className="p-3.5 bg-rose-50/50 rounded-2xl border border-rose-100">
            <span className="text-rose-700 block font-semibold text-[11px]">Rejected</span>
            <span className="text-xl font-extrabold text-rose-800 mt-1 block">
              {globalMetrics.rejected}
            </span>
            <span className="text-[10px] text-rose-600">Administrative</span>
          </div>

          {/* Card 9 */}
          <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-100">
            <span className="text-amber-700 block font-semibold text-[11px]">Reopened</span>
            <span className="text-xl font-extrabold text-amber-800 mt-1 block">
              {globalMetrics.reopened}
            </span>
            <span className="text-[10px] text-amber-600">Disputed</span>
          </div>

          {/* Card 10 */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-semibold text-[11px]">Closed</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {globalMetrics.closed}
            </span>
            <span className="text-[10px] text-slate-400">Archived</span>
          </div>

          {/* Card 11 */}
          <div className="p-3.5 bg-blue-50/50 rounded-2xl border border-blue-100">
            <span className="text-blue-700 block font-semibold text-[11px]">Active Officers</span>
            <span className="text-xl font-extrabold text-blue-800 mt-1 block">
              {globalMetrics.activeOfficersCount}
            </span>
            <span className="text-[10px] text-blue-600">In Directory</span>
          </div>

          {/* Card 12 */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-slate-500 block font-semibold text-[11px]">Dept Admins</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {globalMetrics.activeDeptAdminsCount}
            </span>
            <span className="text-[10px] text-slate-400">Assigned</span>
          </div>

          {/* Card 13 */}
          <div className="p-3.5 bg-rose-50/50 rounded-2xl border border-rose-100 col-span-2 sm:col-span-2 lg:col-span-2">
            <span className="text-rose-700 block font-semibold text-[11px]">SLA Escalations</span>
            <span className="text-xl font-extrabold text-rose-800 mt-1 block">
              {globalMetrics.slaEscalations}
            </span>
            <span className="text-[10px] text-rose-600">Breached / Escalated</span>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. NAVIGATION TABS                                                    */}
      {/* ===================================================================== */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 no-scrollbar">
        {[
          { id: 'departments', label: `Departments & Admins (${departments.length})` },
          { id: 'grievances', label: `Global Grievances (${allGrievances.length})` },
          { id: 'officers', label: `Global Officer Directory (${globalOfficers.length})` },
          { id: 'categories', label: `Global Categories (${categories.length})` },
          { id: 'sla', label: `SLA Monitoring & Tiers` },
          { id: 'audit', label: `Global Audit Trail (${totalAudits})` },
          { id: 'emergency', label: `🚨 Emergency Governance` },
          { id: 'contracts', label: `System Configuration` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: DEPARTMENTS & DEPARTMENT ADMINS (Requirement #3 & #4)          */}
      {/* ===================================================================== */}
      {activeTab === 'departments' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="Department & Administrator Governance"
            subtitle="Authoritative municipal organizational hierarchy managed on DepartmentManager.sol"
            headerAction={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateDeptModal(true)}
                className="font-bold"
              >
                + Create Department
              </Button>
            }
          >
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search departments by name, ID, or admin address..."
                  value={deptSearch}
                  onChange={(e) => setDeptSearch(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                />
              </div>

              {/* Department Listing Table */}
              {loading ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
                  Loading departments...
                </div>
              ) : filteredDepartments.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No departments found matching your criteria.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                  <table className="w-full text-left text-xs min-w-[720px]">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">ID</th>
                        <th className="py-3 px-4">Department Name</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Department Admin</th>
                        <th className="py-3 px-4">Officers</th>
                        <th className="py-3 px-4">Total Cases</th>
                        <th className="py-3 px-4">Created Date</th>
                        <th className="py-3 px-4 text-right">Governance Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDepartments.map((d) => (
                        <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">#{d.id}</td>
                          <td className="py-3 px-4 font-bold text-slate-800">{d.name}</td>
                          <td className="py-3 px-4">
                            {d.isActive ? (
                              <Badge variant="success" dot className="text-[10px]">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="danger" dot className="text-[10px]">
                                Deactivated
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                            {d.admin && d.admin !== '0x0000000000000000000000000000000000000000' ? (
                              <a
                                href={getExplorerAddressUrl(d.admin)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline font-semibold inline-flex items-center gap-1"
                              >
                                <span>{shortenAddress(d.admin, 5)}</span>
                                <span>↗</span>
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {d.officerCount ?? 0}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {d.grievanceCount ?? 0}
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {formatTimestamp(d.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2 text-xs">
                              {d.isActive ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDept(d);
                                      setEditDeptName(d.name);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                                  >
                                    Rename
                                  </button>
                                  <span>•</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setChangingAdminDept(d);
                                      setNewAdminAddr(d.admin);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                                  >
                                    Change Admin
                                  </button>
                                  {d.admin &&
                                    d.admin !== '0x0000000000000000000000000000000000000000' && (
                                      <>
                                        <span>•</span>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmRemoveAdmin(d)}
                                          className="text-amber-700 hover:text-amber-900 font-semibold cursor-pointer"
                                        >
                                          Remove Admin
                                        </button>
                                      </>
                                    )}
                                  <span>•</span>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeactivateDept(d)}
                                    className="text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                                  >
                                    Deactivate
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmReactivateDept(d)}
                                  className="text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer"
                                >
                                  Reactivate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Informative Governance Callout */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-[11px] text-slate-500 space-y-1">
                <p className="font-semibold text-slate-800">
                  ℹ️ Department Governance & Historical Preservation Rules:
                </p>
                <p>
                  1. Deactivating a department sets its on-chain status to inactive. All historical grievances, officers, and audit records remain permanently intact.
                </p>
                <p>
                  2. Department Admins operate strictly within their assigned department. Super Admin maintains system-wide department assignment authority.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: GLOBAL GRIEVANCES (Requirement #2)                             */}
      {/* ===================================================================== */}
      {activeTab === 'grievances' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="Global Grievance Registry"
            subtitle="Immutable operational cases across all municipal departments on GrievanceSystem.sol"
          >
            <div className="space-y-5">
              {/* Status Sub-Filters */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
                {[
                  { id: 'all', label: `All (${allGrievances.length})` },
                  { id: 'pending', label: `Pending (${globalMetrics.pending})` },
                  { id: 'investigating', label: `Investigating (${globalMetrics.investigations})` },
                  { id: 'resolution', label: `Resolution (${globalMetrics.resolutions})` },
                  { id: 'resolved', label: `Resolved (${globalMetrics.resolved})` },
                  { id: 'rejected', label: `Rejected (${globalMetrics.rejected})` },
                  { id: 'reopened', label: `Reopened (${globalMetrics.reopened})` },
                  { id: 'closed', label: `Closed (${globalMetrics.closed})` },
                  { id: 'escalated', label: `Escalated (${slaEscalatedCases.length})` },
                ].map((sTab) => (
                  <button
                    key={sTab.id}
                    type="button"
                    onClick={() => setGrievanceStatusFilter(sTab.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      grievanceStatusFilter === sTab.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {sTab.label}
                  </button>
                ))}
              </div>

              {/* Multi-attribute Filter Toolbar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                {/* Search Input */}
                <div className="lg:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Keyword Search
                  </label>
                  <input
                    type="text"
                    placeholder="Search ID, title, citizen, officer..."
                    value={grievanceSearch}
                    onChange={(e) => setGrievanceSearch(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>

                {/* Department Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Department
                  </label>
                  <select
                    value={grievanceDeptFilter}
                    onChange={(e) => setGrievanceDeptFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  >
                    <option value="all">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        #{d.id} {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Category
                  </label>
                  <select
                    value={grievanceCatFilter}
                    onChange={(e) => setGrievanceCatFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.id} {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Priority Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Priority
                  </label>
                  <select
                    value={grievancePriorityFilter}
                    onChange={(e) => setGrievancePriorityFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  >
                    <option value="all">All Priorities</option>
                    <option value={PRIORITIES.LOW}>Low</option>
                    <option value={PRIORITIES.MEDIUM}>Medium</option>
                    <option value={PRIORITIES.HIGH}>High</option>
                    <option value={PRIORITIES.CRITICAL}>Critical</option>
                  </select>
                </div>

                {/* Officer Filter + Reset */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Assigned Officer
                    </label>
                    <select
                      value={grievanceOfficerFilter}
                      onChange={(e) => setGrievanceOfficerFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none font-mono text-[11px]"
                    >
                      <option value="all">All Officers</option>
                      {globalOfficers.map((o) => (
                        <option key={o.address} value={o.address}>
                          {shortenAddress(o.address, 4)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => {
                      setGrievanceSearch('');
                      setGrievanceStatusFilter('all');
                      setGrievanceDeptFilter('all');
                      setGrievanceCatFilter('all');
                      setGrievanceOfficerFilter('all');
                      setGrievancePriorityFilter('all');
                    }}
                    className="shrink-0 mb-0.5"
                  >
                    Reset
                  </Button>
                </div>
              </div>

              {/* Grievances Table */}
              {loading ? (
                <div className="py-12 text-center text-xs text-slate-500">Loading cases...</div>
              ) : filteredGrievances.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  No grievances found matching the selected filter criteria.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-3">ID</th>
                        <th className="py-3 px-3">Title</th>
                        <th className="py-3 px-3">Department</th>
                        <th className="py-3 px-3">Category</th>
                        <th className="py-3 px-3">Citizen</th>
                        <th className="py-3 px-3">Assigned Officer</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Priority</th>
                        <th className="py-3 px-3">SLA Deadline</th>
                        <th className="py-3 px-3">Created</th>
                        <th className="py-3 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredGrievances.map((g) => {
                        const sMeta = STATUS_METADATA[g.status] || {
                          label: 'Unknown',
                          badgeVariant: 'default',
                        };
                        const pMeta = PRIORITY_METADATA[g.priority] || {
                          label: 'Normal',
                          badgeVariant: 'default',
                        };
                        const isOverdue =
                          [STATUSES.UNDER_REVIEW, STATUSES.UNDER_INVESTIGATION].includes(
                            g.status
                          ) && currentTime > g.slaDeadline;
                        const isCompleted = [
                          STATUSES.ACCEPTED,
                          STATUSES.CLOSED,
                          STATUSES.REJECTED,
                        ].includes(g.status);

                        return (
                          <tr key={g.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-3 font-mono font-bold text-slate-900">
                              #{g.id}
                            </td>
                            <td className="py-3 px-3 font-bold text-slate-800 max-w-[180px] truncate">
                              {g.title}
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-semibold text-slate-700 block">
                                {deptMap[g.departmentId] || `Dept #${g.departmentId}`}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-600">
                              {catMap[g.categoryId] || `Cat #${g.categoryId}`}
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px]">
                              <a
                                href={getExplorerAddressUrl(g.citizen)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {shortenAddress(g.citizen, 4)}
                              </a>
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px]">
                              {g.assignedOfficer &&
                              g.assignedOfficer !== '0x0000000000000000000000000000000000000000' ? (
                                <a
                                  href={getExplorerAddressUrl(g.assignedOfficer)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline font-semibold"
                                >
                                  {shortenAddress(g.assignedOfficer, 4)}
                                </a>
                              ) : (
                                <span className="text-slate-400 italic">Unassigned</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant={sMeta.badgeVariant} dot className="text-[10px]">
                                {sMeta.label}
                              </Badge>
                              {isCompleted && (
                                <span className="ml-1 text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-mono">
                                  Historical
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant={pMeta.badgeVariant} className="text-[10px]">
                                {pMeta.label}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px]">
                              {formatTimestamp(g.slaDeadline)}
                              {isOverdue && (
                                <span className="block text-[10px] text-rose-600 font-bold">
                                  Breached
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                              {formatTimestamp(g.createdAt)}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handleOpenCaseInspection(g)}
                                  className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                                >
                                  Inspect Case
                                </button>
                                <span>•</span>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/grievance/${g.id}`)}
                                  className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                                >
                                  View
                                </button>
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

      {/* ===================================================================== */}
      {/* TAB 3: GLOBAL OFFICER DIRECTORY (Requirement #6)                      */}
      {/* ===================================================================== */}
      {activeTab === 'officers' && (
        <div className="space-y-6 animate-fade-in">
          {/* Operational Scope Notice */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3 text-xs text-blue-900">
            <span className="text-base shrink-0">🏛️</span>
            <div>
              <p className="font-bold">Decentralized Departmental Responsibility Notice:</p>
              <p className="text-blue-700 mt-0.5">
                Department-level officer roster management (add, remove, transfer) is handled by the assigned Department Admin. Super Admin maintains global directory visibility and emergency recovery oversight.
              </p>
            </div>
          </div>

          <Card
            title="Global Officer Directory"
            subtitle="Verified municipal officers enrolled across all department rosters on DepartmentManager.sol"
          >
            <div className="space-y-4">
              {/* Filter controls */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  placeholder="Search officers by address or department..."
                  value={officerSearch}
                  onChange={(e) => setOfficerSearch(e.target.value)}
                  className="w-full sm:flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                />
                <select
                  value={officerDeptFilter}
                  onChange={(e) => setOfficerDeptFilter(e.target.value)}
                  className="w-full sm:w-60 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      #{d.id} {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {filteredOfficers.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  No officers currently registered matching the criteria.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                  <table className="w-full text-left text-xs min-w-[640px]">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">Officer Wallet</th>
                        <th className="py-3 px-4">Assigned Department(s)</th>
                        <th className="py-3 px-4">Total Cases</th>
                        <th className="py-3 px-4">Active Workload</th>
                        <th className="py-3 px-4">Resolved Cases</th>
                        <th className="py-3 px-4 text-right">Directory Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {filteredOfficers.map((o) => (
                        <tr key={o.address} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 text-blue-600 font-bold">
                            <a
                              href={getExplorerAddressUrl(o.address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline inline-flex items-center gap-1"
                            >
                              <span>{o.address}</span>
                              <span className="text-[10px]">↗</span>
                            </a>
                          </td>
                          <td className="py-3 px-4 font-sans">
                            <div className="flex flex-wrap gap-1">
                              {o.departments.map((d) => (
                                <Badge
                                  key={d.id}
                                  variant={d.isActive ? 'primary' : 'neutral'}
                                  className="text-[10px]"
                                >
                                  #{d.id} {d.name}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800 font-sans">
                            {o.assignedCount}
                          </td>
                          <td className="py-3 px-4 font-bold text-amber-700 font-sans">
                            {o.activeWorkload}
                          </td>
                          <td className="py-3 px-4 font-bold text-emerald-700 font-sans">
                            {o.resolvedCount}
                          </td>
                          <td className="py-3 px-4 text-right font-sans">
                            <button
                              type="button"
                              onClick={() => {
                                setGrievanceOfficerFilter(o.address);
                                setActiveTab('grievances');
                              }}
                              className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                            >
                              View Cases
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: GLOBAL CATEGORIES (Requirement #5 - READ-ONLY OVERVIEW)        */}
      {/* ===================================================================== */}
      {activeTab === 'categories' && (
        <div className="space-y-6 animate-fade-in">
          {/* Operational Scope Notice */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3 text-xs text-blue-900">
            <span className="text-base shrink-0">ℹ️</span>
            <div>
              <p className="font-bold">Department-Level Classification Notice:</p>
              <p className="text-blue-700 mt-0.5">
                Department-level category management is handled by the assigned Department Admin. Super Admin maintains global visibility into active classifications across all departments.
              </p>
            </div>
          </div>

          <Card
            title="Global Grievance Categories (Read-Only Overview)"
            subtitle="Authoritative classification tags registered on DepartmentManager.sol"
          >
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  placeholder="Search categories by name or ID..."
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  className="w-full sm:flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                />
                <select
                  value={catDeptFilter}
                  onChange={(e) => setCatDeptFilter(e.target.value)}
                  className="w-full sm:w-60 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      #{d.id} {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {filteredCategories.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  No categories found matching criteria.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                  <table className="w-full text-left text-xs min-w-[640px]">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">ID</th>
                        <th className="py-3 px-4">Category Name</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">Created Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCategories.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">#{c.id}</td>
                          <td className="py-3 px-4 font-bold text-slate-800">{c.name}</td>
                          <td className="py-3 px-4">
                            {c.departmentId && c.departmentId > 0 ? (
                              <Badge variant="neutral" className="text-[10px]">
                                {deptMap[c.departmentId] || `Dept #${c.departmentId}`}
                              </Badge>
                            ) : (
                              <Badge variant="default" className="text-[10px]">
                                Global / System-Wide
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {c.isActive ? (
                              <Badge variant="success" dot className="text-[10px]">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="danger" dot className="text-[10px]">
                                Deactivated
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                            {c.description || '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {formatTimestamp(c.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: SLA GLOBAL MONITORING & TIERS (Requirement #7)                  */}
      {/* ===================================================================== */}
      {activeTab === 'sla' && (
        <div className="space-y-6 animate-fade-in">
          {/* SLA Top Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-1">
              <span className="text-emerald-700 font-semibold text-xs block">Active On-Track</span>
              <span className="text-2xl font-extrabold text-emerald-900 block">
                {slaActiveCases.length}
              </span>
              <span className="text-[10px] text-emerald-600">Within Target Deadline</span>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-1">
              <span className="text-amber-700 font-semibold text-xs block">Overdue Cases</span>
              <span className="text-2xl font-extrabold text-amber-900 block">
                {slaOverdueCases.length}
              </span>
              <span className="text-[10px] text-amber-600">Deadline Elapsed</span>
            </div>

            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 space-y-1">
              <span className="text-rose-700 font-semibold text-xs block">Formally Escalated</span>
              <span className="text-2xl font-extrabold text-rose-900 block">
                {slaEscalatedCases.length}
              </span>
              <span className="text-[10px] text-rose-600">Awaiting Admin Intervention</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
              <span className="text-slate-500 font-semibold text-xs block">Completed Cases</span>
              <span className="text-2xl font-extrabold text-slate-900 block">
                {slaCompletedCases.length}
              </span>
              <span className="text-[10px] text-slate-400">Resolved / Closed</span>
            </div>
          </div>

          {/* Department Breakdown Table */}
          <Card
            title="Department SLA Compliance Breakdown"
            subtitle="Operational resolution compliance monitored across departments"
          >
            <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Total Cases</th>
                    <th className="py-3 px-4">Investigations</th>
                    <th className="py-3 px-4">Overdue Cases</th>
                    <th className="py-3 px-4">Escalations</th>
                    <th className="py-3 px-4">Compliance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {departmentSlaBreakdown.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-800">
                        #{item.id} {item.name}
                      </td>
                      <td className="py-3 px-4">
                        {item.isActive ? (
                          <Badge variant="success" dot className="text-[10px]">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="danger" dot className="text-[10px]">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">{item.totalCases}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {item.activeInvestigations}
                      </td>
                      <td className="py-3 px-4 font-bold text-amber-700">{item.overdue}</td>
                      <td className="py-3 px-4 font-bold text-rose-700">{item.escalated}</td>
                      <td className="py-3 px-4">
                        {item.escalated > 0 ? (
                          <Badge variant="danger">Escalation Triggered</Badge>
                        ) : item.overdue > 0 ? (
                          <Badge variant="warning">Attention Needed</Badge>
                        ) : (
                          <Badge variant="success">Compliant</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Active Escalated Cases Action Queue */}
          {slaEscalatedCases.length > 0 && (
            <Card
              title="Escalated Cases Action Queue"
              subtitle="Grievances with breached SLAs currently in ESCALATED state"
            >
              <div className="space-y-3">
                {slaEscalatedCases.map((g) => (
                  <div
                    key={g.id}
                    className="p-4 bg-rose-50/50 border border-rose-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="danger">Case #{g.id}</Badge>
                        <span className="font-bold text-slate-900">{g.title}</span>
                      </div>
                      <p className="text-slate-500 mt-1">
                        Department: <strong>{deptMap[g.departmentId] || `Dept #${g.departmentId}`}</strong> • Assigned Officer:{' '}
                        <span className="font-mono">{shortenAddress(g.assignedOfficer, 4)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="primary"
                        size="xs"
                        onClick={() => setConfirmResolveEscalation(g)}
                        className="font-bold bg-rose-700 hover:bg-rose-800"
                      >
                        Resolve Escalation
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => handleOpenCaseInspection(g)}
                      >
                        Inspect
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* SLA Tier Durations Configuration Panel */}
          <Card
            title="Service Level Agreement (SLA) Duration Tiers"
            subtitle="Configures deterministic on-chain resolution deadlines for grievance priority levels"
          >
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {slaDurations.map((sla) => {
                  const pMeta = PRIORITY_METADATA[sla.priority] || {
                    label: 'Unknown',
                    badgeVariant: 'default',
                  };
                  const days = Math.round(sla.durationSeconds / 86400);

                  return (
                    <div
                      key={sla.priority}
                      className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant={pMeta.badgeVariant}>{pMeta.label} Priority</Badge>
                        <span className="font-mono text-xs text-slate-400">Tier #{sla.priority}</span>
                      </div>
                      <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                        {days} Days
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {sla.durationSeconds.toLocaleString()} seconds
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Update SLA Form */}
              <form
                onSubmit={handleUpdateSla}
                className="p-5 bg-white border border-slate-200/80 rounded-2xl space-y-4"
              >
                <h4 className="text-sm font-bold text-slate-900">Update SLA Tier Duration</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Priority Level Tier *
                    </label>
                    <select
                      value={selectedPriorityForSla}
                      onChange={(e) => setSelectedPriorityForSla(Number(e.target.value))}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    >
                      <option value={PRIORITIES.LOW}>Low Priority (Tier 0)</option>
                      <option value={PRIORITIES.MEDIUM}>Medium Priority (Tier 1)</option>
                      <option value={PRIORITIES.HIGH}>High Priority (Tier 2)</option>
                      <option value={PRIORITIES.CRITICAL}>Critical Priority (Tier 3)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Duration Target in Days *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      required
                      value={newSlaDays}
                      onChange={(e) => setNewSlaDays(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" variant="primary" size="sm" className="font-bold">
                    Commit SLA Duration On-Chain
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 6: GLOBAL AUDIT TRAIL (Requirement #8)                            */}
      {/* ===================================================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title={`Forensic Global Audit Trail (${totalAudits} Total Records)`}
            subtitle="Immutable event entries recorded on AuditTrail.sol by authoritative system contracts"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <form onSubmit={handleSearchAuditTarget} className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Search by Target / Grievance ID"
                    value={searchTargetId}
                    onChange={(e) => setSearchTargetId(e.target.value)}
                    className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono outline-none"
                  />
                  <Button type="submit" variant="secondary" size="xs">
                    Search Target
                  </Button>
                </form>

                <form onSubmit={handleSearchAuditActor} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search by Actor Address (0x...)"
                    value={searchActorAddr}
                    onChange={(e) => setSearchActorAddr(e.target.value)}
                    className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono outline-none"
                  />
                  <Button type="submit" variant="secondary" size="xs">
                    Search Actor
                  </Button>
                </form>

                <div className="flex justify-end items-center">
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => {
                      setSearchTargetId('');
                      setSearchActorAddr('');
                      loadGlobalData();
                    }}
                  >
                    Refresh Recent 40
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-slate-500">Loading audit records...</div>
              ) : auditEntries.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  No audit entries found matching your query.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                  <table className="w-full text-left text-xs min-w-[640px]">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Action Type</th>
                        <th className="py-2.5 px-3">Target ID</th>
                        <th className="py-2.5 px-3">Actor</th>
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3">Details Hash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {auditEntries.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-slate-900">#{a.id}</td>
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-800">
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">
                              {AUDIT_ACTION_NAMES[a.action] || a.actionName || `Action #${a.action}`}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">#{a.targetId}</td>
                          <td className="py-2.5 px-3 text-blue-600">
                            <a
                              href={getExplorerAddressUrl(a.actor)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              {shortenAddress(a.actor, 5)} ↗
                            </a>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 font-sans">
                            {formatTimestamp(a.timestamp)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 truncate max-w-[120px]">
                            {a.detailsHash && a.detailsHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'
                              ? `${a.detailsHash.slice(0, 10)}...`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 7: EMERGENCY GOVERNANCE (Requirement #9 & #12)                     */}
      {/* ===================================================================== */}
      {activeTab === 'emergency' && (
        <div className="space-y-6 animate-fade-in">
          {/* Emergency Section Warning */}
          <div className="p-5 bg-rose-50 border border-rose-300 rounded-3xl space-y-2 text-xs text-rose-950">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚨</span>
              <h3 className="font-extrabold text-sm uppercase tracking-wide text-rose-900">
                Emergency Governance & Protocol Recovery
              </h3>
            </div>
            <p className="text-rose-800">
              Operations in this section directly invoke smart-contract administrative overrides on RoleManager, DepartmentManager, and EscalationManager.
              They are intended for disaster recovery, system lockout protection, and administrative intervention.
              <strong> Do NOT use these functions for normal operational triage.</strong>
            </p>
          </div>

          {/* Role Governance Panel */}
          <Card
            title="Protocol Role Governance (RoleManager.sol)"
            subtitle="Grant or revoke administrative roles with on-chain last-super-admin lockout safety"
          >
            <div className="space-y-6">
              {/* Account Inspector Input */}
              <form onSubmit={handleInspectRoles} className="flex gap-2.5">
                <input
                  type="text"
                  placeholder="Enter Ethereum Address to inspect roles (0x...)"
                  value={inspectAddress}
                  onChange={(e) => setInspectAddress(e.target.value)}
                  className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono outline-none"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={inspectLoading}
                  className="font-bold shrink-0"
                >
                  Inspect Address
                </Button>
              </form>

              {/* Inspected Results Panel */}
              {inspectedRoles && (
                <div className="p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4 text-xs animate-fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
                    <div>
                      <span className="text-slate-400 block font-medium text-[11px]">
                        Inspected Account
                      </span>
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {inspectAddress}
                      </span>
                    </div>
                    {inspectedRoles.isSuperAdmin && (
                      <Badge variant="danger" dot>
                        SUPER ADMIN
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Citizen Role */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">Citizen Role</span>
                        {inspectedRoles.isCitizen ? (
                          <Badge variant="success" className="text-[10px]">
                            Granted
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px]">
                            No
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">Self-registered via wallet</p>
                    </div>

                    {/* Officer Role */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">Officer Role</span>
                        {inspectedRoles.isOfficer ? (
                          <Badge variant="warning" className="text-[10px]">
                            Granted
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px]">
                            No
                          </Badge>
                        )}
                      </div>
                      <div className="pt-1">
                        {inspectedRoles.isOfficer ? (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmRoleAction({
                                actionFn: revokeOfficerRole,
                                label: 'Revoke Officer Role',
                                targetAddr: inspectAddress,
                              })
                            }
                            className="text-rose-600 hover:text-rose-800 font-bold text-[11px] cursor-pointer"
                          >
                            Revoke Officer
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmRoleAction({
                                actionFn: grantOfficerRole,
                                label: 'Grant Officer Role',
                                targetAddr: inspectAddress,
                              })
                            }
                            className="text-blue-600 hover:text-blue-800 font-bold text-[11px] cursor-pointer"
                          >
                            Grant Officer
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Department Admin Role */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">Dept Admin Role</span>
                        {inspectedRoles.isDeptAdmin ? (
                          <Badge variant="primary" className="text-[10px]">
                            Granted
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px]">
                            No
                          </Badge>
                        )}
                      </div>
                      <div className="pt-1">
                        {inspectedRoles.isDeptAdmin ? (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmRoleAction({
                                actionFn: revokeDepartmentAdminRole,
                                label: 'Revoke Department Admin Role',
                                targetAddr: inspectAddress,
                              })
                            }
                            className="text-rose-600 hover:text-rose-800 font-bold text-[11px] cursor-pointer"
                          >
                            Revoke Dept Admin
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmRoleAction({
                                actionFn: grantDepartmentAdminRole,
                                label: 'Grant Department Admin Role',
                                targetAddr: inspectAddress,
                              })
                            }
                            className="text-blue-600 hover:text-blue-800 font-bold text-[11px] cursor-pointer"
                          >
                            Grant Dept Admin
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Super Admin Role */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">Super Admin</span>
                        {inspectedRoles.isSuperAdmin ? (
                          <Badge variant="danger" className="text-[10px]">
                            Granted
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px]">
                            No
                          </Badge>
                        )}
                      </div>
                      <div className="pt-1">
                        {inspectedRoles.isSuperAdmin ? (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmRoleAction({
                                actionFn: revokeSuperAdminRole,
                                label: 'Revoke Super Admin Role',
                                targetAddr: inspectAddress,
                                isSuperAdminRevoke: true,
                              })
                            }
                            className="text-rose-600 hover:text-rose-800 font-bold text-[11px] cursor-pointer"
                          >
                            Revoke Super Admin
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmRoleAction({
                                actionFn: grantSuperAdminRole,
                                label: 'Grant Super Admin Role',
                                targetAddr: inspectAddress,
                              })
                            }
                            className="text-rose-700 hover:text-rose-900 font-bold text-[11px] cursor-pointer"
                          >
                            Grant Super Admin
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 8: SYSTEM CONFIGURATION (Requirement #10)                         */}
      {/* ===================================================================== */}
      {activeTab === 'contracts' && (
        <div className="space-y-6 animate-fade-in">
          {/* Contracts Info Card */}
          <Card
            title="Protocol Contract Topology"
            subtitle="Verified on-chain smart contracts deployed on Ethereum Sepolia (Chain ID 11155111)"
          >
            <div className="space-y-3">
              {[
                { name: 'RoleManager', addr: CONTRACT_ADDRESSES.RoleManager, desc: 'Centralized Role-Based Access Control and permissions registry' },
                { name: 'DepartmentManager', addr: CONTRACT_ADDRESSES.DepartmentManager, desc: 'Organizational hierarchy, officer rosters, and categories' },
                { name: 'GrievanceSystem', addr: CONTRACT_ADDRESSES.GrievanceSystem, desc: 'Core grievance lifecycle, transitions, and on-chain state machine' },
                { name: 'EscalationManager', addr: CONTRACT_ADDRESSES.EscalationManager, desc: 'SLA breach detection, escalation records, and resolution hooks' },
                { name: 'AuditTrail', addr: CONTRACT_ADDRESSES.AuditTrail, desc: 'Append-only forensic audit log recording all protocol transitions' },
              ].map((c) => (
                <div
                  key={c.name}
                  className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 text-sm block">{c.name}</span>
                    <span className="text-slate-500 text-[11px]">{c.desc}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <a
                      href={getExplorerAddressUrl(c.addr)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-semibold bg-white px-2.5 py-1 rounded-lg border border-slate-200"
                    >
                      {c.addr} ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* IPFS Backend Configuration Status */}
          <Card
            title="IPFS Decentralized Storage Gateway Status"
            subtitle="FastAPI backend pinning proxy integration status"
          >
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Pinata Backend Proxy:</span>
                {ipfsHealth.configured ? (
                  <Badge variant="success" dot>
                    Configured & Operational
                  </Badge>
                ) : (
                  <Badge variant="warning" dot>
                    Fallback Gateways Active
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Designated Gateway:</span>
                <span className="font-mono text-slate-800">
                  {ipfsHealth.gateway || 'https://gateway.pinata.cloud'}
                </span>
              </div>
            </div>
          </Card>

          {/* Bytecode Verification Status Component */}
          <ContractStatusCard />
        </div>
      )}

      {/* ===================================================================== */}
      {/* CASE INSPECTION MODAL (Requirement #2 & #4)                           */}
      {/* ===================================================================== */}
      <Modal
        isOpen={Boolean(inspectedGrievance)}
        onClose={() => setInspectedGrievance(null)}
        title={`Grievance Dossier #${inspectedGrievance?.id}`}
        subtitle="On-chain grievance record and immutable forensic audit trail"
      >
        {inspectedGrievance && (
          <div className="space-y-5 text-xs max-h-[75vh] overflow-y-auto pr-1">
            {/* Header badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-2">
                <Badge
                  variant={STATUS_METADATA[inspectedGrievance.status]?.badgeVariant || 'default'}
                  dot
                >
                  {STATUS_METADATA[inspectedGrievance.status]?.label || 'Status'}
                </Badge>
                <Badge
                  variant={PRIORITY_METADATA[inspectedGrievance.priority]?.badgeVariant || 'default'}
                >
                  {PRIORITY_METADATA[inspectedGrievance.priority]?.label || 'Priority'} Priority
                </Badge>
              </div>
              {[STATUSES.ACCEPTED, STATUSES.CLOSED, STATUSES.REJECTED].includes(
                inspectedGrievance.status
              ) && (
                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                  🔒 Sealed Historical Case
                </span>
              )}
            </div>

            {/* Case Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-white border border-slate-200/80 rounded-2xl">
              <div>
                <span className="text-slate-400 block text-[11px]">Title</span>
                <span className="font-bold text-slate-900 text-sm block">
                  {inspectedGrievance.title}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Department</span>
                <span className="font-semibold text-slate-800 block">
                  {deptMap[inspectedGrievance.departmentId] || `Dept #${inspectedGrievance.departmentId}`}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Category</span>
                <span className="font-semibold text-slate-800 block">
                  {catMap[inspectedGrievance.categoryId] || `Cat #${inspectedGrievance.categoryId}`}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Citizen Address</span>
                <a
                  href={getExplorerAddressUrl(inspectedGrievance.citizen)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 underline font-semibold block truncate"
                >
                  {inspectedGrievance.citizen} ↗
                </a>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Assigned Officer</span>
                {inspectedGrievance.assignedOfficer &&
                inspectedGrievance.assignedOfficer !== '0x0000000000000000000000000000000000000000' ? (
                  <a
                    href={getExplorerAddressUrl(inspectedGrievance.assignedOfficer)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-600 underline font-semibold block truncate"
                  >
                    {inspectedGrievance.assignedOfficer} ↗
                  </a>
                ) : (
                  <span className="text-slate-400 italic">Unassigned</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Created Date</span>
                <span className="font-mono text-slate-700 block">
                  {formatTimestamp(inspectedGrievance.createdAt)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">SLA Resolution Deadline</span>
                <span className="font-mono text-slate-700 block">
                  {formatTimestamp(inspectedGrievance.slaDeadline)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">IPFS Storage Reference</span>
                {inspectedGrievance.descriptionCid ? (
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${inspectedGrievance.descriptionCid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-600 underline truncate block"
                  >
                    {inspectedGrievance.descriptionCid} ↗
                  </a>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
            </div>

            {/* IPFS Description Content */}
            <div className="space-y-1.5">
              <span className="font-bold text-slate-800 text-xs block">
                Off-Chain Description Payload:
              </span>
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-slate-700 text-xs font-mono whitespace-pre-wrap max-h-36 overflow-y-auto">
                {caseIpfsLoading ? (
                  <span className="text-slate-400">Fetching decentralized content...</span>
                ) : caseIpfsContent ? (
                  caseIpfsContent
                ) : (
                  <span className="text-slate-400">No extended payload available.</span>
                )}
              </div>
            </div>

            {/* Case Audit History */}
            <div className="space-y-1.5">
              <span className="font-bold text-slate-800 text-xs block">
                On-Chain Audit Records ({caseAudits.length}):
              </span>
              {caseAuditsLoading ? (
                <div className="py-4 text-center text-xs text-slate-400">Loading audit trail...</div>
              ) : caseAudits.length === 0 ? (
                <div className="p-3 bg-slate-50 rounded-xl text-center text-xs text-slate-400">
                  No audit logs recorded for this case.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {caseAudits.map((a) => (
                    <div
                      key={a.id}
                      className="p-2.5 bg-white flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-900 block">
                          {AUDIT_ACTION_NAMES[a.action] || a.actionName || `Action #${a.action}`}
                        </span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          By {shortenAddress(a.actor, 4)} • {formatTimestamp(a.timestamp)}
                        </span>
                      </div>
                      <Badge variant="neutral" className="text-[10px]">
                        Entry #{a.id}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Navigation */}
            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setInspectedGrievance(null)}
              >
                Close Dossier
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const id = inspectedGrievance.id;
                  setInspectedGrievance(null);
                  navigate(`/grievance/${id}`);
                }}
              >
                Open Case Page
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================================================================== */}
      {/* MODALS & CONFIRM DIALOGS                                              */}
      {/* ===================================================================== */}

      {/* Create Department Modal */}
      <Modal
        isOpen={showCreateDeptModal}
        onClose={() => setShowCreateDeptModal(false)}
        title="Create New Department"
        subtitle="Registers an official public administration department on DepartmentManager.sol"
      >
        <form onSubmit={handleCreateDepartment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Department Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Healthcare"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Department Administrator *
              </label>
              {adminRoleStatus === 'has_role' && (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  ✓ Has Department Admin Role
                </span>
              )}
              {adminRoleStatus === 'missing_role' && (
                <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                  ⚠ Does not have Department Admin Role
                </span>
              )}
              {adminRoleStatus === 'checking' && (
                <span className="text-[11px] text-slate-400 animate-pulse">
                  Checking on-chain role...
                </span>
              )}
            </div>

            <input
              type="text"
              required
              placeholder="0x... (Enter or select an Ethereum address)"
              value={newDeptAdmin}
              onChange={(e) => setNewDeptAdmin(e.target.value)}
              className={`w-full text-xs px-3.5 py-2.5 rounded-xl border font-mono outline-none ${
                adminRoleStatus === 'has_role'
                  ? 'border-emerald-300 bg-emerald-50/20'
                  : adminRoleStatus === 'missing_role'
                  ? 'border-amber-300 bg-amber-50/20'
                  : 'border-slate-200 bg-slate-50 focus:bg-white'
              }`}
            />

            {eligibleAdmins.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <span className="text-[10px] text-slate-400 font-semibold">Existing Department Admins:</span>
                {eligibleAdmins.map((addr) => (
                  <button
                    key={addr}
                    type="button"
                    onClick={() => setNewDeptAdmin(addr)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-colors ${
                      newDeptAdmin.toLowerCase() === addr.toLowerCase()
                        ? 'bg-blue-100 text-blue-800 border-blue-300 font-bold'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {shortenAddress(addr, 4)}
                  </button>
                ))}
              </div>
            )}

            {/* Step 1: Grant Role Action */}
            {adminRoleStatus === 'missing_role' && (
              <div className="mt-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2.5 text-xs text-amber-900 animate-fade-in">
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none">⚠</span>
                  <div>
                    <p className="font-bold text-amber-900">Step 1 Required: Grant Department Admin Role</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      This wallet is not currently a Department Admin. Grant <code className="font-mono font-bold text-amber-950">DEPARTMENT_ADMIN_ROLE</code> before assigning this wallet to a department.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    size="xs"
                    loading={isGrantingRole}
                    onClick={handleGrantRoleForNewDept}
                    className="font-bold bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    Grant Department Admin Role
                  </Button>
                </div>
              </div>
            )}

            {adminRoleStatus === 'invalid_address' && newDeptAdmin.trim().length > 0 && (
              <p className="mt-1 text-[11px] text-rose-500 font-medium">
                Please enter a valid 42-character Ethereum address (0x...)
              </p>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowCreateDeptModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="font-bold"
              disabled={
                !newDeptName.trim() ||
                !isValidAddress(newDeptAdmin.trim()) ||
                adminRoleStatus !== 'has_role' ||
                isGrantingRole
              }
            >
              Create Department
            </Button>
          </div>
        </form>
      </Modal>

      {/* Rename Department Modal */}
      <Modal
        isOpen={Boolean(editingDept)}
        onClose={() => setEditingDept(null)}
        title={`Rename Department #${editingDept?.id}`}
      >
        <form onSubmit={handleUpdateDeptName} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Department Name *
            </label>
            <input
              type="text"
              required
              value={editDeptName}
              onChange={(e) => setEditDeptName(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditingDept(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" className="font-bold">
              Update Name
            </Button>
          </div>
        </form>
      </Modal>

      {/* Change Department Admin Modal */}
      <Modal
        isOpen={Boolean(changingAdminDept)}
        onClose={() => setChangingAdminDept(null)}
        title={`Change Admin for ${changingAdminDept?.name}`}
      >
        <form onSubmit={handleSetDeptAdmin} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                New Department Administrator *
              </label>
              {changeAdminRoleStatus === 'has_role' && (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  ✓ Has Department Admin Role
                </span>
              )}
              {changeAdminRoleStatus === 'missing_role' && (
                <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                  ⚠ Does not have Department Admin Role
                </span>
              )}
              {changeAdminRoleStatus === 'checking' && (
                <span className="text-[11px] text-slate-400 animate-pulse">
                  Checking on-chain role...
                </span>
              )}
            </div>

            <input
              type="text"
              required
              placeholder="0x... (Enter or select an Ethereum address)"
              value={newAdminAddr}
              onChange={(e) => setNewAdminAddr(e.target.value)}
              className={`w-full text-xs px-3.5 py-2.5 rounded-xl border font-mono outline-none ${
                changeAdminRoleStatus === 'has_role'
                  ? 'border-emerald-300 bg-emerald-50/20'
                  : changeAdminRoleStatus === 'missing_role'
                  ? 'border-amber-300 bg-amber-50/20'
                  : 'border-slate-200 bg-slate-50 focus:bg-white'
              }`}
            />

            {eligibleAdmins.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <span className="text-[10px] text-slate-400 font-semibold">Existing Department Admins:</span>
                {eligibleAdmins.map((addr) => (
                  <button
                    key={addr}
                    type="button"
                    onClick={() => setNewAdminAddr(addr)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-colors ${
                      newAdminAddr.toLowerCase() === addr.toLowerCase()
                        ? 'bg-blue-100 text-blue-800 border-blue-300 font-bold'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {shortenAddress(addr, 4)}
                  </button>
                ))}
              </div>
            )}

            {/* Step 1: Grant Role Action */}
            {changeAdminRoleStatus === 'missing_role' && (
              <div className="mt-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2.5 text-xs text-amber-900 animate-fade-in">
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none">⚠</span>
                  <div>
                    <p className="font-bold text-amber-900">Step 1 Required: Grant Department Admin Role</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      This wallet is not currently a Department Admin. Grant <code className="font-mono font-bold text-amber-950">DEPARTMENT_ADMIN_ROLE</code> before assigning this wallet to a department.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    size="xs"
                    loading={isGrantingChangeAdminRole}
                    onClick={handleGrantRoleForChangeDept}
                    className="font-bold bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    Grant Department Admin Role
                  </Button>
                </div>
              </div>
            )}

            {changeAdminRoleStatus === 'invalid_address' && newAdminAddr.trim().length > 0 && (
              <p className="mt-1 text-[11px] text-rose-500 font-medium">
                Please enter a valid 42-character Ethereum address (0x...)
              </p>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setChangingAdminDept(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="font-bold"
              disabled={
                !isValidAddress(newAdminAddr.trim()) ||
                changeAdminRoleStatus !== 'has_role' ||
                isGrantingChangeAdminRole
              }
            >
              Assign Admin
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirm Deactivate Department Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmDeactivateDept)}
        onClose={() => setConfirmDeactivateDept(null)}
        onConfirm={executeDeactivateDept}
        title="Deactivate Department?"
        message={`Are you sure you want to deactivate Department #${confirmDeactivateDept?.id} (${confirmDeactivateDept?.name})? All historical grievances, assigned officers, and audit records will remain permanently intact.`}
        confirmText="Deactivate"
        variant="danger"
      />

      {/* Confirm Reactivate Department Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmReactivateDept)}
        onClose={() => setConfirmReactivateDept(null)}
        onConfirm={executeReactivateDept}
        title="Reactivate Department?"
        message={`Reactivate Department #${confirmReactivateDept?.id} (${confirmReactivateDept?.name}) to allow new grievances under its jurisdiction.`}
        confirmText="Reactivate"
        variant="primary"
      />

      {/* Confirm Remove Department Admin Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmRemoveAdmin)}
        onClose={() => setConfirmRemoveAdmin(null)}
        onConfirm={executeRemoveDeptAdmin}
        title="Remove Department Admin?"
        message={`Remove ${shortenAddress(confirmRemoveAdmin?.admin, 6)} from administering Department #${confirmRemoveAdmin?.id}?`}
        confirmText="Remove Admin"
        variant="danger"
      />

      {/* Confirm Resolve Escalation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmResolveEscalation)}
        onClose={() => setConfirmResolveEscalation(null)}
        onConfirm={handleResolveEscalationAction}
        title="Resolve Escalation?"
        message={`Resolve SLA escalation for Grievance #${confirmResolveEscalation?.id}? The case will return to UNDER_INVESTIGATION status.`}
        confirmText="Resolve Escalation"
        variant="primary"
      />

      {/* Confirm RBAC Role Action Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmRoleAction)}
        onClose={() => setConfirmRoleAction(null)}
        onConfirm={executeRoleAction}
        title={`${confirmRoleAction?.label}?`}
        message={`Are you sure you want to execute ${confirmRoleAction?.label} for address ${confirmRoleAction?.targetAddr}?`}
        confirmText="Execute On-Chain"
        variant={confirmRoleAction?.label?.includes('Revoke') ? 'danger' : 'primary'}
      />
    </div>
  );
}
