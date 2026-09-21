import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRoles } from '../hooks/useRoles';
import { ContractStatusCard } from '../components/blockchain/ContractStatusCard';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { formatTimestamp, shortenAddress } from '../utils/formatters';

import {
  fetchAllDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
  setDepartmentAdmin,
  fetchAllCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
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

export function SuperAdminDashboard() {
  const { address, signer, provider, networkName, chainId } = useWallet();
  const { superAdminCount: contextAdminCount } = useRoles();

  const [activeTab, setActiveTab] = useState('departments');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const runner = provider || signer;

  // =========================================================================
  // 1. DEPARTMENTS STATE
  // =========================================================================
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptAdmin, setNewDeptAdmin] = useState('');
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [changingAdminDeptId, setChangingAdminDeptId] = useState(null);
  const [newAdminAddr, setNewAdminAddr] = useState('');

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
  // 2. CATEGORIES STATE
  // =========================================================================
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');

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
  const [auditFilterMode, setAuditFilterMode] = useState('recent'); // 'recent' | 'target' | 'actor'

  const loadAuditData = useCallback(async () => {
    if (!runner) return;
    try {
      setLoading(true);
      const total = await fetchAuditCount(runner);
      setTotalAudits(total);

      if (total > 0) {
        // Load latest up to 50
        const start = Math.max(1, total - 49);
        const entries = await fetchAuditEntriesRange(runner, start, total);
        setAuditEntries(entries.reverse()); // Latest first
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
    if (activeTab === 'departments') loadDepartments();
    if (activeTab === 'categories') loadCategories();
    if (activeTab === 'sla') loadSla();
    if (activeTab === 'rbac') loadAdminCount();
    if (activeTab === 'audit') loadAuditData();
  }, [activeTab, loadDepartments, loadCategories, loadSla, loadAdminCount, loadAuditData]);

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
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Failed to create department.');
    } finally {
      setActionLoading('');
    }
  };

  const handleUpdateDeptName = async (e, deptId) => {
    e.preventDefault();
    try {
      setActionLoading(`edit_dept_${deptId}`);
      setError(null);
      setSuccessMsg('');
      await updateDepartment(signer, deptId, editDeptName.trim());
      setSuccessMsg(`Department #${deptId} renamed to "${editDeptName}".`);
      setEditingDeptId(null);
      setEditDeptName('');
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Failed to update department name.');
    } finally {
      setActionLoading('');
    }
  };

  const handleSetDeptAdmin = async (e, deptId) => {
    e.preventDefault();
    try {
      setActionLoading(`set_admin_${deptId}`);
      setError(null);
      setSuccessMsg('');
      await setDepartmentAdmin(signer, deptId, newAdminAddr.trim());
      setSuccessMsg(`Admin for Department #${deptId} updated to ${shortenAddress(newAdminAddr, 6)}.`);
      setChangingAdminDeptId(null);
      setNewAdminAddr('');
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Failed to update department admin.');
    } finally {
      setActionLoading('');
    }
  };

  const handleDeactivateDept = async (deptId) => {
    if (!window.confirm(`Warning: Deactivating Department #${deptId} is permanent. The contract has no reactivation function. Proceed?`)) {
      return;
    }
    try {
      setActionLoading(`deact_dept_${deptId}`);
      setError(null);
      setSuccessMsg('');
      await deactivateDepartment(signer, deptId);
      setSuccessMsg(`Department #${deptId} permanently deactivated.`);
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Failed to deactivate department.');
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
      setSuccessMsg(`Category "${newCatName}" created successfully!`);
      setNewCatName('');
      setNewCatDesc('');
      await loadCategories();
    } catch (err) {
      setError(err.message || 'Failed to create category.');
    } finally {
      setActionLoading('');
    }
  };

  const handleUpdateCategory = async (e, catId) => {
    e.preventDefault();
    try {
      setActionLoading(`edit_cat_${catId}`);
      setError(null);
      setSuccessMsg('');
      await updateCategory(signer, catId, editCatName.trim(), editCatDesc.trim());
      setSuccessMsg(`Category #${catId} updated successfully.`);
      setEditingCatId(null);
      setEditCatName('');
      setEditCatDesc('');
      await loadCategories();
    } catch (err) {
      setError(err.message || 'Failed to update category.');
    } finally {
      setActionLoading('');
    }
  };

  const handleDeactivateCategory = async (catId) => {
    try {
      setActionLoading(`deact_cat_${catId}`);
      setError(null);
      setSuccessMsg('');
      await deactivateCategory(signer, catId);
      setSuccessMsg(`Category #${catId} deactivated.`);
      await loadCategories();
    } catch (err) {
      setError(err.message || 'Failed to deactivate category.');
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
      setSuccessMsg(`SLA target for priority tier ${selectedPriorityForSla} updated to ${days} days.`);
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

  const handleRoleAction = async (actionFn, actionKey, label) => {
    if (!inspectAddress.trim()) return;
    try {
      setActionLoading(actionKey);
      setError(null);
      setSuccessMsg('');
      await actionFn(signer, inspectAddress.trim());
      setSuccessMsg(`Successfully executed: ${label} for ${shortenAddress(inspectAddress.trim(), 6)}.`);
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
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Super Admin Top Banner */}
      <Card className="bg-linear-to-r from-rose-950 via-slate-900 to-slate-900 text-white border-0 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="danger" className="bg-rose-900/80 text-rose-200 border-rose-600">
                Super Admin Console
              </Badge>
              <span className="text-xs text-slate-300 font-mono">
                Chain ID: {chainId} ({networkName})
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">System Governance & Protocol Administration</h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Authorized Administrator: <span className="font-mono font-semibold text-white">{address}</span>
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5">
            <Badge variant="danger" className="text-xs">
              Role: SUPER_ADMIN_ROLE
            </Badge>
            <span className="text-[11px] text-slate-400">
              Active Super Admins On-Chain: <strong>{liveAdminCount}</strong> (Safety Lockout Floor: 1)
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

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200">
        {[
          { id: 'departments', label: 'Departments' },
          { id: 'categories', label: 'Categories' },
          { id: 'sla', label: 'SLA Durations' },
          { id: 'rbac', label: 'RBAC & Roles' },
          { id: 'audit', label: `Audit Inspector (${totalAudits})` },
          { id: 'contracts', label: 'Contract Health' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-rose-700 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 1. DEPARTMENTS TAB */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'departments' && (
        <div className="space-y-6">
          <Card
            title={`Department Registry (${departments.length})`}
            subtitle="DepartmentManager.sol authoritative organizational structure"
          >
            <div className="space-y-4">
              {/* Create Department Form */}
              <form
                onSubmit={handleCreateDepartment}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
              >
                <h4 className="text-xs font-bold text-slate-800">Create New Department</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Department Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Public Works & Infrastructure"
                      value={newDeptName}
                      onChange={(e) => setNewDeptName(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Assigned Department Admin (0x...) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="0x..."
                      value={newDeptAdmin}
                      onChange={(e) => setNewDeptAdmin(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-mono outline-none bg-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={actionLoading === 'create_dept'}
                  >
                    Deploy Department Record
                  </Button>
                </div>
              </form>

              {/* Department Listing */}
              {loading ? (
                <div className="py-6 text-center text-xs text-slate-500">Loading departments...</div>
              ) : departments.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">No departments created yet.</div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-hidden">
                  {departments.map((d) => (
                    <div key={d.id} className="p-3.5 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">#{d.id}</span>
                          <span className="font-bold text-slate-800 text-sm">{d.name}</span>
                          {d.isActive ? (
                            <Badge variant="success" className="text-[10px]">Active</Badge>
                          ) : (
                            <Badge variant="danger" className="text-[10px]">Deactivated</Badge>
                          )}
                        </div>
                        <span className="text-slate-400 font-mono text-[11px]">
                          Created: {formatTimestamp(d.createdAt)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-slate-600 text-[11px] gap-2">
                        <span>
                          Assigned Admin: <span className="font-mono text-slate-900">{d.admin}</span>
                        </span>
                        {d.isActive && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDeptId(d.id);
                                setEditDeptName(d.name);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium underline"
                            >
                              Rename
                            </button>
                            <span>|</span>
                            <button
                              type="button"
                              onClick={() => {
                                setChangingAdminDeptId(d.id);
                                setNewAdminAddr(d.admin);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium underline"
                            >
                              Change Admin
                            </button>
                            <span>|</span>
                            <button
                              type="button"
                              onClick={() => handleDeactivateDept(d.id)}
                              className="text-rose-600 hover:text-rose-800 font-medium underline"
                            >
                              Deactivate
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Inline Rename Form */}
                      {editingDeptId === d.id && (
                        <form
                          onSubmit={(e) => handleUpdateDeptName(e, d.id)}
                          className="p-2.5 bg-blue-50 border border-blue-200 rounded flex gap-2 items-center"
                        >
                          <input
                            type="text"
                            required
                            value={editDeptName}
                            onChange={(e) => setEditDeptName(e.target.value)}
                            className="text-xs px-2 py-1 border border-slate-300 rounded flex-1 bg-white"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingDeptId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            loading={actionLoading === `edit_dept_${d.id}`}
                          >
                            Save
                          </Button>
                        </form>
                      )}

                      {/* Inline Change Admin Form */}
                      {changingAdminDeptId === d.id && (
                        <form
                          onSubmit={(e) => handleSetDeptAdmin(e, d.id)}
                          className="p-2.5 bg-amber-50 border border-amber-200 rounded flex flex-col sm:flex-row gap-2"
                        >
                          <input
                            type="text"
                            required
                            placeholder="New Admin 0x..."
                            value={newAdminAddr}
                            onChange={(e) => setNewAdminAddr(e.target.value)}
                            className="text-xs px-2 py-1 border border-slate-300 rounded flex-1 font-mono bg-white"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setChangingAdminDeptId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              variant="primary"
                              size="sm"
                              loading={actionLoading === `set_admin_${d.id}`}
                            >
                              Assign Admin
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 2. CATEGORIES TAB */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <Card
            title={`Category Registry (${categories.length})`}
            subtitle="Dynamic categories configured in DepartmentManager.sol"
          >
            <div className="space-y-4">
              {/* Create Category Form */}
              <form
                onSubmit={handleCreateCategory}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
              >
                <h4 className="text-xs font-bold text-slate-800">Add New Category</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Category Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Water Contamination & Sewage"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      placeholder="Short description of issues covered"
                      value={newCatDesc}
                      onChange={(e) => setNewCatDesc(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded outline-none bg-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={actionLoading === 'create_cat'}
                  >
                    Add Category
                  </Button>
                </div>
              </form>

              {/* Category Listing */}
              {loading ? (
                <div className="py-6 text-center text-xs text-slate-500">Loading categories...</div>
              ) : categories.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">No categories registered yet.</div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-hidden">
                  {categories.map((c) => (
                    <div key={c.id} className="p-3.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">#{c.id}</span>
                          <span className="font-bold text-slate-800 text-sm">{c.name}</span>
                          {c.isActive ? (
                            <Badge variant="success" className="text-[10px]">Active</Badge>
                          ) : (
                            <Badge variant="danger" className="text-[10px]">Deactivated</Badge>
                          )}
                        </div>
                        {c.isActive && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCatId(c.id);
                                setEditCatName(c.name);
                                setEditCatDesc(c.description);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium underline"
                            >
                              Edit
                            </button>
                            <span>|</span>
                            <button
                              type="button"
                              onClick={() => handleDeactivateCategory(c.id)}
                              className="text-rose-600 hover:text-rose-800 font-medium underline"
                            >
                              Deactivate
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="text-slate-600 text-[11px]">{c.description || 'No description'}</p>

                      {/* Inline Edit Form */}
                      {editingCatId === c.id && (
                        <form
                          onSubmit={(e) => handleUpdateCategory(e, c.id)}
                          className="p-3 bg-blue-50 border border-blue-200 rounded space-y-2 mt-2"
                        >
                          <input
                            type="text"
                            required
                            value={editCatName}
                            onChange={(e) => setEditCatName(e.target.value)}
                            className="w-full text-xs px-2 py-1 border border-slate-300 rounded bg-white"
                          />
                          <input
                            type="text"
                            value={editCatDesc}
                            onChange={(e) => setEditCatDesc(e.target.value)}
                            placeholder="Description"
                            className="w-full text-xs px-2 py-1 border border-slate-300 rounded bg-white"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditingCatId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              variant="primary"
                              size="sm"
                              loading={actionLoading === `edit_cat_${c.id}`}
                            >
                              Save Category
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 3. SLA CONFIGURATION TAB */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'sla' && (
        <div className="space-y-6">
          <Card
            title="Global SLA Duration Configuration"
            subtitle="Configures default resolution deadlines per priority tier in GrievanceSystem.sol"
          >
            <div className="space-y-6">
              {/* Current SLA Durations Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {slaDurations.map((sla) => {
                  const days = (sla.durationSeconds / 86400).toFixed(1);
                  const hours = Math.round(sla.durationSeconds / 3600);
                  const prioMeta = PRIORITY_METADATA[sla.priority] || { badgeVariant: 'default' };

                  return (
                    <div
                      key={sla.priority}
                      className="p-4 bg-white border border-slate-200 rounded-lg space-y-2 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-sm">{sla.label}</span>
                        <Badge variant={prioMeta.badgeVariant}>Tier {sla.priority}</Badge>
                      </div>
                      <div className="text-2xl font-bold text-slate-900 font-mono">
                        {days} <span className="text-xs font-normal text-slate-500">days</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {hours} hours ({sla.durationSeconds}s)
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Update SLA Form */}
              <form
                onSubmit={handleUpdateSla}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
              >
                <h4 className="text-xs font-bold text-slate-800">Update Tier Duration</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Priority Tier *
                    </label>
                    <select
                      value={selectedPriorityForSla}
                      onChange={(e) => setSelectedPriorityForSla(Number(e.target.value))}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded outline-none bg-white"
                    >
                      <option value={PRIORITIES.LOW}>Low Priority (Default 14 days)</option>
                      <option value={PRIORITIES.MEDIUM}>Medium Priority (Default 7 days)</option>
                      <option value={PRIORITIES.HIGH}>High Priority (Default 3 days)</option>
                      <option value={PRIORITIES.CRITICAL}>Critical Priority (Default 1 day)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      New Duration in Days *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      required
                      value={newSlaDays}
                      onChange={(e) => setNewSlaDays(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded outline-none bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={actionLoading === 'update_sla'}
                  >
                    Commit SLA Duration on Blockchain
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 4. RBAC & PRIVILEGE MANAGEMENT TAB */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'rbac' && (
        <div className="space-y-6">
          <Card
            title="RBAC & Role Privilege Inspector"
            subtitle="Governed by RoleManager.sol with lockout prevention"
          >
            <div className="space-y-6">
              {/* Address Lookup */}
              <form onSubmit={handleInspectRoles} className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Enter wallet address (0x...) to inspect or modify roles"
                  value={inspectAddress}
                  onChange={(e) => setInspectAddress(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded font-mono outline-none bg-white"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={inspectLoading}
                >
                  Inspect Account
                </Button>
              </form>

              {/* Inspected Account Detail */}
              {inspectedRoles && (
                <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-xs text-slate-500">Account:</span>
                      <span className="ml-2 font-mono font-bold text-slate-900 text-xs">
                        {inspectAddress}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {inspectedRoles.isSuperAdmin && <Badge variant="danger">SUPER_ADMIN</Badge>}
                      {inspectedRoles.isDeptAdmin && <Badge variant="neutral">DEPT_ADMIN</Badge>}
                      {inspectedRoles.isOfficer && <Badge variant="warning">OFFICER</Badge>}
                      {inspectedRoles.isCitizen && <Badge variant="primary">CITIZEN</Badge>}
                      {inspectedRoles.activeRoles.length === 0 && (
                        <Badge variant="default">No Active Roles</Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    {/* Dept Admin Role */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                      <h5 className="font-semibold text-slate-800">Department Admin Role</h5>
                      <p className="text-[11px] text-slate-500">
                        Authorizes triage, case assignment, and officer roster management.
                      </p>
                      {inspectedRoles.isDeptAdmin ? (
                        <Button
                          variant="danger"
                          size="sm"
                          className="w-full text-xs"
                          loading={actionLoading === 'revoke_dept'}
                          onClick={() =>
                            handleRoleAction(
                              revokeDepartmentAdminRole,
                              'revoke_dept',
                              'Revoke Department Admin'
                            )
                          }
                        >
                          Revoke Dept Admin
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full text-xs"
                          loading={actionLoading === 'grant_dept'}
                          onClick={() =>
                            handleRoleAction(
                              grantDepartmentAdminRole,
                              'grant_dept',
                              'Grant Department Admin'
                            )
                          }
                        >
                          Grant Dept Admin
                        </Button>
                      )}
                    </div>

                    {/* Officer Role */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                      <h5 className="font-semibold text-slate-800">Officer Role</h5>
                      <p className="text-[11px] text-slate-500">
                        Authorizes formal review, active investigation, and resolution submission.
                      </p>
                      {inspectedRoles.isOfficer ? (
                        <Button
                          variant="danger"
                          size="sm"
                          className="w-full text-xs"
                          loading={actionLoading === 'revoke_off'}
                          onClick={() =>
                            handleRoleAction(
                              revokeOfficerRole,
                              'revoke_off',
                              'Revoke Officer'
                            )
                          }
                        >
                          Revoke Officer
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full text-xs"
                          loading={actionLoading === 'grant_off'}
                          onClick={() =>
                            handleRoleAction(
                              grantOfficerRole,
                              'grant_off',
                              'Grant Officer'
                            )
                          }
                        >
                          Grant Officer
                        </Button>
                      )}
                    </div>

                    {/* Super Admin Role */}
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded space-y-2">
                      <h5 className="font-semibold text-rose-900">Super Admin Role</h5>
                      <p className="text-[11px] text-rose-800">
                        Full protocol governance. Cannot revoke if only 1 Super Admin remains.
                      </p>
                      {inspectedRoles.isSuperAdmin ? (
                        <Button
                          variant="danger"
                          size="sm"
                          className="w-full text-xs"
                          loading={actionLoading === 'revoke_super'}
                          onClick={() =>
                            handleRoleAction(
                              revokeSuperAdminRole,
                              'revoke_super',
                              'Revoke Super Admin'
                            )
                          }
                        >
                          Revoke Super Admin
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full text-xs"
                          loading={actionLoading === 'grant_super'}
                          onClick={() =>
                            handleRoleAction(
                              grantSuperAdminRole,
                              'grant_super',
                              'Grant Super Admin'
                            )
                          }
                        >
                          Grant Super Admin
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 5. AUDIT TRAIL INSPECTOR TAB */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <Card
            title={`Forensic Audit Trail Inspector (${totalAudits} total events)`}
            subtitle="AuditTrail.sol append-only immutable system ledger"
          >
            <div className="space-y-4">
              {/* Filter controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                {/* Search by Grievance / Target ID */}
                <form onSubmit={handleSearchAuditTarget} className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Search by Target ID (e.g. Grievance #1)"
                    value={searchTargetId}
                    onChange={(e) => setSearchTargetId(e.target.value)}
                    className="flex-1 text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white outline-none"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Filter
                  </Button>
                </form>

                {/* Search by Actor Address */}
                <form onSubmit={handleSearchAuditActor} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search by Actor Address (0x...)"
                    value={searchActorAddr}
                    onChange={(e) => setSearchActorAddr(e.target.value)}
                    className="flex-1 text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono outline-none"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Filter
                  </Button>
                </form>
              </div>

              {auditFilterMode !== 'recent' && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Filtered Audit View ({auditEntries.length} results)</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuditFilterMode('recent');
                      setSearchTargetId('');
                      setSearchActorAddr('');
                      loadAuditData();
                    }}
                    className="text-blue-600 hover:underline"
                  >
                    Reset to Recent Audits
                  </button>
                </div>
              )}

              {/* Audit Entries List */}
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Querying audit log entries...
                </div>
              ) : auditEntries.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No matching audit entries found on-chain.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-hidden text-xs">
                  {auditEntries.map((a) => (
                    <div key={a.id} className="p-3 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="neutral" className="font-mono text-[10px]">
                            #{a.id}
                          </Badge>
                          <span className="font-semibold text-slate-900">{a.actionName}</span>
                          <span className="text-slate-500 text-[11px]">
                            Target ID: <strong className="text-slate-700">#{a.targetId}</strong>
                          </span>
                        </div>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {formatTimestamp(a.timestamp)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-slate-500 text-[11px] gap-2">
                        <span>
                          Actor: <span className="font-mono text-slate-800">{a.actor}</span>
                        </span>
                        {a.detailsHash &&
                          a.detailsHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
                            <span className="font-mono text-[10px] text-slate-400 break-all">
                              Hash: {a.detailsHash.slice(0, 18)}...
                            </span>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 6. CONTRACT STATUS TAB */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'contracts' && (
        <div className="space-y-6">
          <ContractStatusCard />
        </div>
      )}
    </div>
  );
}
