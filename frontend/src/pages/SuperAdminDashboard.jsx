import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRoles } from '../hooks/useRoles';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { formatTimestamp, shortenAddress, getExplorerAddressUrl } from '../utils/formatters';

import {
  fetchAllDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
  reactivateDepartment,
  setDepartmentAdmin,
  removeDepartmentAdmin,
  fetchAllCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
  reactivateCategory,
} from '../services/departmentService';

import {
  PRIORITIES,
  PRIORITY_METADATA,
  fetchSlaDurations,
  updateSlaDuration,
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
  fetchAuditCount,
  fetchAuditEntriesRange,
  fetchAuditsByTarget,
  fetchAuditsByActor,
} from '../services/auditService';

import { ContractStatusCard } from '../components/blockchain/ContractStatusCard';

export function SuperAdminDashboard() {
  const { address, signer, provider, chainId } = useWallet();
  const { superAdminCount: contextAdminCount } = useRoles();

  const [activeTab, setActiveTab] = useState('departments');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const runner = provider || signer;

  // =========================================================================
  // 1. DEPARTMENTS STATE & MODALS
  // =========================================================================
  const [departments, setDepartments] = useState([]);
  const [deptSearch, setDeptSearch] = useState('');

  // Modals for Department actions
  const [showCreateDeptModal, setShowCreateDeptModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptAdmin, setNewDeptAdmin] = useState('');

  const [editingDept, setEditingDept] = useState(null); // { id, name }
  const [editDeptName, setEditDeptName] = useState('');

  const [changingAdminDept, setChangingAdminDept] = useState(null); // { id, name, admin }
  const [newAdminAddr, setNewAdminAddr] = useState('');

  const [confirmDeactivateDept, setConfirmDeactivateDept] = useState(null);
  const [confirmReactivateDept, setConfirmReactivateDept] = useState(null);
  const [confirmRemoveAdmin, setConfirmRemoveAdmin] = useState(null);

  const loadDepartments = useCallback(async () => {
    if (!runner) return;
    try {
      setLoading(true);
      const depts = await fetchAllDepartments(runner);
      setDepartments(depts);
    } catch (err) {
      console.error('Failed to load departments:', err);
    } finally {
      setLoading(false);
    }
  }, [runner]);

  // =========================================================================
  // 2. CATEGORIES STATE & MODALS
  // =========================================================================
  const [categories, setCategories] = useState([]);
  const [catSearch, setCatSearch] = useState('');

  const [showCreateCatModal, setShowCreateCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  const [editingCat, setEditingCat] = useState(null); // { id, name, description }
  const [editCatName, setEditCatName] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');

  const [confirmDeactivateCat, setConfirmDeactivateCat] = useState(null);
  const [confirmReactivateCat, setConfirmReactivateCat] = useState(null);

  const loadCategories = useCallback(async () => {
    if (!runner) return;
    try {
      setLoading(true);
      const cats = await fetchAllCategories(runner);
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  }, [runner]);

  // =========================================================================
  // 3. SLA TIERS STATE
  // =========================================================================
  const [slaDurations, setSlaDurations] = useState([]);
  const [selectedPriorityForSla, setSelectedPriorityForSla] = useState(PRIORITIES.LOW);
  const [newSlaDays, setNewSlaDays] = useState('14');

  const loadSla = useCallback(async () => {
    if (!runner) return;
    try {
      setLoading(true);
      const list = await fetchSlaDurations(runner);
      setSlaDurations(list);
    } catch (err) {
      console.error('Failed to load SLA durations:', err);
    } finally {
      setLoading(false);
    }
  }, [runner]);

  // =========================================================================
  // 4. RBAC MANAGEMENT STATE
  // =========================================================================
  const [liveAdminCount, setLiveAdminCount] = useState(contextAdminCount || 1);
  const [inspectAddress, setInspectAddress] = useState('');
  const [inspectedRoles, setInspectedRoles] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [confirmRoleAction, setConfirmRoleAction] = useState(null); // { actionFn, actionKey, label, address }

  const loadAdminCount = useCallback(async () => {
    if (!runner) return;
    try {
      const count = await fetchSuperAdminCount(runner);
      setLiveAdminCount(count);
    } catch (e) {
      console.warn('Could not read admin count:', e);
    }
  }, [runner]);

  // =========================================================================
  // 5. AUDIT TRAIL INSPECTOR STATE
  // =========================================================================
  const [totalAudits, setTotalAudits] = useState(0);
  const [auditEntries, setAuditEntries] = useState([]);
  const [searchTargetId, setSearchTargetId] = useState('');
  const [searchActorAddr, setSearchActorAddr] = useState('');
  const [_auditFilterMode, setAuditFilterMode] = useState('recent');

  const loadAuditData = useCallback(async () => {
    if (!runner) return;
    try {
      setLoading(true);
      const total = await fetchAuditCount(runner);
      setTotalAudits(total);

      if (total > 0) {
        const start = Math.max(1, total - 49);
        const entries = await fetchAuditEntriesRange(runner, start, total);
        setAuditEntries(entries.reverse());
      } else {
        setAuditEntries([]);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [runner]);

  // Load initial tab data
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!active) return;
      if (activeTab === 'departments') await loadDepartments();
      if (activeTab === 'categories') await loadCategories();
      if (activeTab === 'sla') await loadSla();
      if (activeTab === 'rbac') await loadAdminCount();
      if (activeTab === 'audit') await loadAuditData();
    };
    load();
    return () => {
      active = false;
    };
  }, [activeTab, loadDepartments, loadCategories, loadSla, loadAdminCount, loadAuditData]);

  // Filtered lists
  const filteredDepartments = useMemo(() => {
    if (!deptSearch.trim()) return departments;
    const q = deptSearch.toLowerCase();
    return departments.filter(
      (d) => d.name.toLowerCase().includes(q) || String(d.id).includes(q) || (d.admin && d.admin.toLowerCase().includes(q))
    );
  }, [departments, deptSearch]);

  const filteredCategories = useMemo(() => {
    if (!catSearch.trim()) return categories;
    const q = catSearch.toLowerCase();
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || String(c.id).includes(q)
    );
  }, [categories, catSearch]);

  // -------------------------------------------------------------------------
  // Handlers: Departments
  // -------------------------------------------------------------------------
  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    try {
      setActionLoading('create_dept');
      setError(null);
      setSuccessMsg('');
      await createDepartment(signer, newDeptName.trim(), newDeptAdmin.trim());
      setSuccessMsg(`Department "${newDeptName}" created successfully on-chain!`);
      setNewDeptName('');
      setNewDeptAdmin('');
      setShowCreateDeptModal(false);
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Failed to create department.');
    } finally {
      setActionLoading('');
    }
  };

  const handleUpdateDeptName = async (e) => {
    e.preventDefault();
    if (!editingDept) return;
    try {
      setActionLoading(`edit_dept_${editingDept.id}`);
      setError(null);
      setSuccessMsg('');
      await updateDepartment(signer, editingDept.id, editDeptName.trim());
      setSuccessMsg(`Department #${editingDept.id} renamed to "${editDeptName}".`);
      setEditingDept(null);
      setEditDeptName('');
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Failed to update department name.');
    } finally {
      setActionLoading('');
    }
  };

  const handleSetDeptAdmin = async (e) => {
    e.preventDefault();
    if (!changingAdminDept) return;
    try {
      setActionLoading(`set_admin_${changingAdminDept.id}`);
      setError(null);
      setSuccessMsg('');
      await setDepartmentAdmin(signer, changingAdminDept.id, newAdminAddr.trim());
      setSuccessMsg(`Admin for Department #${changingAdminDept.id} updated to ${shortenAddress(newAdminAddr, 6)}.`);
      setChangingAdminDept(null);
      setNewAdminAddr('');
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Failed to update department admin.');
    } finally {
      setActionLoading('');
    }
  };

  const executeDeactivateDept = async () => {
    if (!confirmDeactivateDept) return;
    const deptId = confirmDeactivateDept.id;
    try {
      setActionLoading(`deact_dept_${deptId}`);
      setError(null);
      setSuccessMsg('');
      await deactivateDepartment(signer, deptId);
      setSuccessMsg(`Department #${deptId} deactivated successfully.`);
      setConfirmDeactivateDept(null);
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Failed to deactivate department.');
    } finally {
      setActionLoading('');
    }
  };

  const executeReactivateDept = async () => {
    if (!confirmReactivateDept) return;
    const deptId = confirmReactivateDept.id;
    try {
      setActionLoading(`react_dept_${deptId}`);
      setError(null);
      setSuccessMsg('');
      await reactivateDepartment(signer, deptId);
      setSuccessMsg(`Department #${deptId} reactivated successfully!`);
      setConfirmReactivateDept(null);
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Failed to reactivate department.');
    } finally {
      setActionLoading('');
    }
  };

  const executeRemoveDeptAdmin = async () => {
    if (!confirmRemoveAdmin) return;
    const deptId = confirmRemoveAdmin.id;
    try {
      setActionLoading(`rm_admin_${deptId}`);
      setError(null);
      setSuccessMsg('');
      await removeDepartmentAdmin(signer, deptId);
      setSuccessMsg(`Admin removed from Department #${deptId}.`);
      setConfirmRemoveAdmin(null);
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Failed to remove department admin.');
    } finally {
      setActionLoading('');
    }
  };

  // -------------------------------------------------------------------------
  // Handlers: Categories
  // -------------------------------------------------------------------------
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    try {
      setActionLoading('create_cat');
      setError(null);
      setSuccessMsg('');
      await createCategory(signer, newCatName.trim(), newCatDesc.trim());
      setSuccessMsg(`Category "${newCatName}" created successfully on-chain!`);
      setNewCatName('');
      setNewCatDesc('');
      setShowCreateCatModal(false);
      await loadCategories();
    } catch (err) {
      setError(err.message || 'Failed to create category.');
    } finally {
      setActionLoading('');
    }
  };

  const handleUpdateCategory = async (e) => {
    e.preventDefault();
    if (!editingCat) return;
    try {
      setActionLoading(`edit_cat_${editingCat.id}`);
      setError(null);
      setSuccessMsg('');
      await updateCategory(signer, editingCat.id, editCatName.trim(), editCatDesc.trim());
      setSuccessMsg(`Category #${editingCat.id} updated successfully.`);
      setEditingCat(null);
      setEditCatName('');
      setEditCatDesc('');
      await loadCategories();
    } catch (err) {
      setError(err.message || 'Failed to update category.');
    } finally {
      setActionLoading('');
    }
  };

  const executeDeactivateCategory = async () => {
    if (!confirmDeactivateCat) return;
    const catId = confirmDeactivateCat.id;
    try {
      setActionLoading(`deact_cat_${catId}`);
      setError(null);
      setSuccessMsg('');
      await deactivateCategory(signer, catId);
      setSuccessMsg(`Category #${catId} deactivated successfully.`);
      setConfirmDeactivateCat(null);
      await loadCategories();
    } catch (err) {
      setError(err.message || 'Failed to deactivate category.');
    } finally {
      setActionLoading('');
    }
  };

  const executeReactivateCategory = async () => {
    if (!confirmReactivateCat) return;
    const catId = confirmReactivateCat.id;
    try {
      setActionLoading(`react_cat_${catId}`);
      setError(null);
      setSuccessMsg('');
      await reactivateCategory(signer, catId);
      setSuccessMsg(`Category #${catId} reactivated successfully!`);
      setConfirmReactivateCat(null);
      await loadCategories();
    } catch (err) {
      setError(err.message || 'Failed to reactivate category.');
    } finally {
      setActionLoading('');
    }
  };

  // -------------------------------------------------------------------------
  // Handlers: SLA
  // -------------------------------------------------------------------------
  const handleUpdateSla = async (e) => {
    e.preventDefault();
    const days = parseFloat(newSlaDays);
    if (isNaN(days) || days <= 0) {
      setError('Please specify a positive number of days for SLA.');
      return;
    }
    const durationSeconds = Math.round(days * 86400);

    try {
      setActionLoading('update_sla');
      setError(null);
      setSuccessMsg('');
      await updateSlaDuration(signer, Number(selectedPriorityForSla), durationSeconds);
      setSuccessMsg(`SLA target for priority tier updated to ${days} days.`);
      await loadSla();
    } catch (err) {
      setError(err.message || 'Failed to update SLA duration.');
    } finally {
      setActionLoading('');
    }
  };

  // -------------------------------------------------------------------------
  // Handlers: RBAC
  // -------------------------------------------------------------------------
  const handleInspectRoles = async (e) => {
    e?.preventDefault();
    if (!inspectAddress.trim()) return;
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

  const executeRoleAction = async () => {
    if (!confirmRoleAction) return;
    const { actionFn, actionKey, label, targetAddr } = confirmRoleAction;
    try {
      setActionLoading(actionKey);
      setError(null);
      setSuccessMsg('');
      await actionFn(signer, targetAddr);
      setSuccessMsg(`Successfully executed: ${label} for ${shortenAddress(targetAddr, 6)}.`);
      setConfirmRoleAction(null);
      await handleInspectRoles();
      await loadAdminCount();
    } catch (err) {
      setError(err.message || 'Role modification failed.');
    } finally {
      setActionLoading('');
    }
  };

  // -------------------------------------------------------------------------
  // Handlers: Audit Queries
  // -------------------------------------------------------------------------
  const handleSearchAuditTarget = async (e) => {
    e.preventDefault();
    if (!searchTargetId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAuditsByTarget(runner, Number(searchTargetId));
      setAuditEntries(res.reverse());
      setAuditFilterMode('target');
    } catch (err) {
      setError(err.message || 'Target audit query failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchAuditActor = async (e) => {
    e.preventDefault();
    if (!searchActorAddr) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAuditsByActor(runner, searchActorAddr.trim());
      setAuditEntries(res.reverse());
      setAuditFilterMode('actor');
    } catch (err) {
      setError(err.message || 'Actor audit query failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-fade-in">
      {/* Super Admin Top Banner */}
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
              System Governance & Protocol Administration
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Authorized Administrator:{' '}
              <span className="font-mono font-semibold text-slate-800">{address}</span>
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
            <span className="text-xs text-slate-500">
              Active Super Admins On-Chain:{' '}
              <strong className="text-slate-900 font-mono font-bold text-sm">
                {liveAdminCount}
              </strong>
            </span>
            <span className="text-[11px] text-slate-400">
              Safety Lockout Floor: 1 Administrator
            </span>
          </div>
        </div>

        {/* High-level Governance Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block font-medium">Departments</span>
            <span className="text-lg font-bold text-slate-900 mt-1 block">
              {departments.length}
            </span>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block font-medium">Active Categories</span>
            <span className="text-lg font-bold text-slate-900 mt-1 block">
              {categories.filter((c) => c.isActive).length} / {categories.length}
            </span>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block font-medium">SLA Tiers</span>
            <span className="text-lg font-bold text-slate-900 mt-1 block">
              {slaDurations.length || 4} Configured
            </span>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block font-medium">Audit Entries</span>
            <span className="text-lg font-bold text-slate-900 mt-1 block">
              {totalAudits} On-Chain
            </span>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <Alert variant="danger" title="Operation Error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert variant="success" title="Success" onClose={() => setSuccessMsg('')}>
          {successMsg}
        </Alert>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200">
        {[
          { id: 'departments', label: `Departments (${departments.length})` },
          { id: 'categories', label: `Categories (${categories.length})` },
          { id: 'sla', label: 'SLA Tiers' },
          { id: 'rbac', label: 'Role Management' },
          { id: 'audit', label: `Audit Inspector (${totalAudits})` },
          { id: 'contracts', label: 'Contract Health' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* =================================================================== */}
      {/* 1. DEPARTMENTS TAB */}
      {/* =================================================================== */}
      {activeTab === 'departments' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="Department Registry"
            subtitle="DepartmentManager.sol authoritative organizational structure"
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
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">ID</th>
                        <th className="py-3 px-4">Department Name</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Assigned Admin</th>
                        <th className="py-3 px-4">Created</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDepartments.map((d) => (
                        <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            #{d.id}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {d.name}
                          </td>
                          <td className="py-3 px-4">
                            {d.isActive ? (
                              <Badge variant="success" dot className="text-[10px]">Active</Badge>
                            ) : (
                              <Badge variant="danger" dot className="text-[10px]">Deactivated</Badge>
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
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {formatTimestamp(d.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
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
                                    Admin
                                  </button>
                                  {d.admin && d.admin !== '0x0000000000000000000000000000000000000000' && (
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
            </div>
          </Card>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. CATEGORIES TAB */}
      {/* =================================================================== */}
      {activeTab === 'categories' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="Grievance Category Registry"
            subtitle="Authoritative classification tags for citizen grievance triage"
            headerAction={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateCatModal(true)}
                className="font-bold"
              >
                + Create Category
              </Button>
            }
          >
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Search categories by name or ID..."
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              />

              {loading ? (
                <div className="py-12 text-center text-xs text-slate-500">Loading categories...</div>
              ) : filteredCategories.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No categories found matching your criteria.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">ID</th>
                        <th className="py-3 px-4">Category Name</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Created</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCategories.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            #{c.id}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {c.name}
                          </td>
                          <td className="py-3 px-4">
                            {c.isActive ? (
                              <Badge variant="success" dot className="text-[10px]">Active</Badge>
                            ) : (
                              <Badge variant="danger" dot className="text-[10px]">Deactivated</Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {formatTimestamp(c.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {c.isActive ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCat(c);
                                      setEditCatName(c.name);
                                      setEditCatDesc(c.description || '');
                                    }}
                                    className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <span>•</span>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeactivateCat(c)}
                                    className="text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                                  >
                                    Deactivate
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmReactivateCat(c)}
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
            </div>
          </Card>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. SLA TIERS TAB */}
      {/* =================================================================== */}
      {activeTab === 'sla' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="Service Level Agreement (SLA) Duration Tiers"
            subtitle="Configures deterministic on-chain resolution deadlines for grievance priority levels"
          >
            <div className="space-y-6">
              {/* SLA Table */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {slaDurations.map((sla) => {
                  const pMeta = PRIORITY_METADATA[sla.priority] || { label: 'Unknown', badgeVariant: 'default' };
                  const days = Math.round(sla.durationSeconds / 86400);

                  return (
                    <div
                      key={sla.priority}
                      className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant={pMeta.badgeVariant}>
                          {pMeta.label} Priority
                        </Badge>
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

              {/* Update SLA Form in clean panel */}
              <form
                onSubmit={handleUpdateSla}
                className="p-5 bg-white border border-slate-200/80 rounded-2xl space-y-4"
              >
                <h4 className="text-sm font-bold text-slate-900">
                  Update SLA Tier Duration
                </h4>
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
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={actionLoading === 'update_sla'}
                    className="font-bold"
                  >
                    Commit SLA Duration On-Chain
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}

      {/* =================================================================== */}
      {/* 4. RBAC TAB */}
      {/* =================================================================== */}
      {activeTab === 'rbac' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title="Role-Based Access Control (RBAC) Governance"
            subtitle="Grant or revoke administrative roles directly governed by RoleManager.sol"
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
                  Inspect Roles
                </Button>
              </form>

              {/* Inspected Results Panel */}
              {inspectedRoles && (
                <div className="p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4 text-xs animate-fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
                    <div>
                      <span className="text-slate-400 block font-medium text-[11px]">Inspected Account</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {inspectAddress}
                      </span>
                    </div>
                    {inspectedRoles.isSuperAdmin && (
                      <Badge variant="danger" dot>SUPER ADMIN</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Citizen Role */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">Citizen Role</span>
                        {inspectedRoles.isCitizen ? (
                          <Badge variant="success" className="text-[10px]">Granted</Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px]">No</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">Self-registered via wallet</p>
                    </div>

                    {/* Officer Role */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">Officer Role</span>
                        {inspectedRoles.isOfficer ? (
                          <Badge variant="warning" className="text-[10px]">Granted</Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px]">No</Badge>
                        )}
                      </div>
                      <div className="pt-1">
                        {inspectedRoles.isOfficer ? (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmRoleAction({
                                actionFn: revokeOfficerRole,
                                actionKey: 'revoke_officer',
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
                                actionKey: 'grant_officer',
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
                          <Badge variant="primary" className="text-[10px]">Granted</Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px]">No</Badge>
                        )}
                      </div>
                      <div className="pt-1">
                        {inspectedRoles.isDeptAdmin ? (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmRoleAction({
                                actionFn: revokeDepartmentAdminRole,
                                actionKey: 'revoke_dept_admin',
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
                                actionKey: 'grant_dept_admin',
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
                          <Badge variant="danger" className="text-[10px]">Granted</Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px]">No</Badge>
                        )}
                      </div>
                      <div className="pt-1">
                        {inspectedRoles.isSuperAdmin ? (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmRoleAction({
                                actionFn: revokeSuperAdminRole,
                                actionKey: 'revoke_super_admin',
                                label: 'Revoke Super Admin Role',
                                targetAddr: inspectAddress,
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
                                actionKey: 'grant_super_admin',
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

      {/* =================================================================== */}
      {/* 5. AUDIT TRAIL TAB */}
      {/* =================================================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-6 animate-fade-in">
          <Card
            title={`Forensic Audit Log Entries (${totalAudits} Total Records)`}
            subtitle="Immutable event entries recorded on AuditTrail.sol by authoritative contracts"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <form onSubmit={handleSearchAuditTarget} className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Search by Grievance / Target ID"
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
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-slate-500">Loading audit records...</div>
              ) : auditEntries.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  No audit entries found matching your query.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Action Type</th>
                        <th className="py-2.5 px-3">Target ID</th>
                        <th className="py-2.5 px-3">Actor</th>
                        <th className="py-2.5 px-3">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {auditEntries.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-slate-900">#{a.id}</td>
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-800">
                            {a.actionName || `Action #${a.actionType}`}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">#{a.targetId}</td>
                          <td className="py-2.5 px-3 text-blue-600">
                            <a
                              href={getExplorerAddressUrl(a.actor)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              {shortenAddress(a.actor, 5)}
                            </a>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 font-sans">
                            {formatTimestamp(a.timestamp)}
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

      {/* =================================================================== */}
      {/* 6. CONTRACT HEALTH TAB */}
      {/* =================================================================== */}
      {activeTab === 'contracts' && (
        <div className="space-y-6 animate-fade-in">
          <ContractStatusCard />
        </div>
      )}

      {/* =================================================================== */}
      {/* MODALS & CONFIRM DIALOGS */}
      {/* =================================================================== */}

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
              placeholder="e.g. Public Works & Infrastructure"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Assigned Department Admin Address (0x...) *
            </label>
            <input
              type="text"
              required
              placeholder="0x..."
              value={newDeptAdmin}
              onChange={(e) => setNewDeptAdmin(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono outline-none"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
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
              loading={actionLoading === 'create_dept'}
              className="font-bold"
            >
              Deploy Department Record
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditingDept(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={actionLoading === `edit_dept_${editingDept?.id}`}
              className="font-bold"
            >
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Admin Address (0x...) *
            </label>
            <input
              type="text"
              required
              value={newAdminAddr}
              onChange={(e) => setNewAdminAddr(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono outline-none"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
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
              loading={actionLoading === `set_admin_${changingAdminDept?.id}`}
              className="font-bold"
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
        message={`Are you sure you want to deactivate Department #${confirmDeactivateDept?.id} (${confirmDeactivateDept?.name})? This will prevent new grievances from being assigned to this department.`}
        confirmText="Deactivate"
        variant="danger"
        loading={actionLoading === `deact_dept_${confirmDeactivateDept?.id}`}
      />

      {/* Confirm Reactivate Department Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmReactivateDept)}
        onClose={() => setConfirmReactivateDept(null)}
        onConfirm={executeReactivateDept}
        title="Reactivate Department?"
        message={`Reactivate Department #${confirmReactivateDept?.id} (${confirmReactivateDept?.name}) to allow citizens to file new grievances under its jurisdiction.`}
        confirmText="Reactivate"
        variant="primary"
        loading={actionLoading === `react_dept_${confirmReactivateDept?.id}`}
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
        loading={actionLoading === `rm_admin_${confirmRemoveAdmin?.id}`}
      />

      {/* Create Category Modal */}
      <Modal
        isOpen={showCreateCatModal}
        onClose={() => setShowCreateCatModal(false)}
        title="Create New Grievance Category"
      >
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Category Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Roads & Highway Maintenance"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Brief description of the grievances falling under this category"
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none resize-none"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowCreateCatModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={actionLoading === 'create_cat'}
              className="font-bold"
            >
              Create Category Record
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Category Modal */}
      <Modal
        isOpen={Boolean(editingCat)}
        onClose={() => setEditingCat(null)}
        title={`Edit Category #${editingCat?.id}`}
      >
        <form onSubmit={handleUpdateCategory} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Category Name *
            </label>
            <input
              type="text"
              required
              value={editCatName}
              onChange={(e) => setEditCatName(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={editCatDesc}
              onChange={(e) => setEditCatDesc(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none resize-none"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditingCat(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={actionLoading === `edit_cat_${editingCat?.id}`}
              className="font-bold"
            >
              Update Category
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirm Deactivate Category Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmDeactivateCat)}
        onClose={() => setConfirmDeactivateCat(null)}
        onConfirm={executeDeactivateCategory}
        title="Deactivate Category?"
        message={`Deactivating Category #${confirmDeactivateCat?.id} will prevent citizens from selecting it for new submissions.`}
        confirmText="Deactivate"
        variant="danger"
        loading={actionLoading === `deact_cat_${confirmDeactivateCat?.id}`}
      />

      {/* Confirm Reactivate Category Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmReactivateCat)}
        onClose={() => setConfirmReactivateCat(null)}
        onConfirm={executeReactivateCategory}
        title="Reactivate Category?"
        message={`Reactivating Category #${confirmReactivateCat?.id} allows citizens to select it for new submissions.`}
        confirmText="Reactivate"
        variant="primary"
        loading={actionLoading === `react_cat_${confirmReactivateCat?.id}`}
      />

      {/* Confirm RBAC Role Action Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmRoleAction)}
        onClose={() => setConfirmRoleAction(null)}
        onConfirm={executeRoleAction}
        title={`${confirmRoleAction?.label}?`}
        message={`Are you sure you want to execute ${confirmRoleAction?.label} for address ${confirmRoleAction?.targetAddr}?`}
        confirmText="Execute On-Chain"
        variant={confirmRoleAction?.actionKey?.startsWith('revoke') ? 'danger' : 'primary'}
        loading={Boolean(actionLoading)}
      />
    </div>
  );
}
