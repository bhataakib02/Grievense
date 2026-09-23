import { ethers } from 'ethers';
import {
  fetchCitizenGrievances,
  fetchDepartmentGrievances,
  fetchOfficerGrievances,
  fetchAllGrievances,
  fetchGrievanceDetails,
  fetchActiveDepartments as fetchActiveDepartmentsOnChain,
  fetchActiveCategories as fetchActiveCategoriesOnChain,
} from './grievanceService.js';

// Resolve backend base URL safely
const BACKEND_BASE_URL = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_IPFS_API_URL)
    ? import.meta.env.VITE_IPFS_API_URL.replace(/\/api\/ipfs.*$/, '')
    : 'http://localhost:8000'
).replace(/\/$/, '');

const CACHE_TIMEOUT_MS = 2500;

/**
 * Normalizes indexed grievance record to match the grievanceService.js object shape.
 */
function normalizeGrievance(item) {
  return {
    id: Number(item.grievance_id || item.id),
    citizen: item.citizen_address,
    departmentId: Number(item.department_id),
    categoryId: Number(item.category_id),
    priority: Number(item.priority),
    status: Number(item.status),
    assignedOfficer: item.assigned_officer && item.assigned_officer !== ethers.ZeroAddress ? item.assigned_officer : null,
    title: item.title || '',
    descriptionCid: item.description_cid || '',
    descriptionHash: item.description_hash || '',
    evidenceCid: item.evidence_cid || '',
    evidenceHash: item.evidence_hash || '',
    createdAt: Number(item.created_at_timestamp || 0),
    updatedAt: Number(item.updated_at_timestamp || 0),
    slaDeadline: Number(item.sla_deadline || 0),
    reopenCount: Number(item.reopen_count || 0),
    isCached: true,
  };
}

/**
 * Attempts fast read from FastAPI/Supabase cache with strict blockchain fallback.
 *
 * @param {import('ethers').ContractRunner} runner
 * @param {string} citizenAddress
 * @returns {Promise<Array<any>>}
 */
export async function getCachedCitizenGrievances(runner, citizenAddress) {
  if (!citizenAddress) return [];

  // 1. FAST PATH: Attempt query from backend cache
  try {
    const url = `${BACKEND_BASE_URL}/api/cached/grievances?citizen=${encodeURIComponent(citizenAddress)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(CACHE_TIMEOUT_MS) });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.grievances) && json.grievances.length > 0) {
        return json.grievances.map(normalizeGrievance);
      }
    }
  } catch {
    // Cache service unavailable or timeout: seamlessly fall through to blockchain
  }

  // 2. AUTHORITATIVE FALLBACK: Direct Ethereum Sepolia smart contract query
  return fetchCitizenGrievances(runner, citizenAddress);
}

/**
 * Attempts fast read of department grievances with on-chain fallback.
 */
export async function getCachedDepartmentGrievances(runner, departmentId) {
  if (!departmentId) return [];

  try {
    const url = `${BACKEND_BASE_URL}/api/cached/grievances?department=${encodeURIComponent(departmentId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(CACHE_TIMEOUT_MS) });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.grievances) && json.grievances.length > 0) {
        return json.grievances.map(normalizeGrievance);
      }
    }
  } catch {}

  return fetchDepartmentGrievances(runner, departmentId);
}

/**
 * Attempts fast read of officer grievances with on-chain fallback.
 */
export async function getCachedOfficerGrievances(runner, officerAddress) {
  if (!officerAddress) return [];

  try {
    const url = `${BACKEND_BASE_URL}/api/cached/grievances?officer=${encodeURIComponent(officerAddress)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(CACHE_TIMEOUT_MS) });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.grievances) && json.grievances.length > 0) {
        return json.grievances.map(normalizeGrievance);
      }
    }
  } catch {}

  return fetchOfficerGrievances(runner, officerAddress);
}

/**
 * Attempts fast read of all grievances with on-chain fallback.
 */
export async function getCachedAllGrievances(runner) {
  try {
    const url = `${BACKEND_BASE_URL}/api/cached/grievances`;
    const res = await fetch(url, { signal: AbortSignal.timeout(CACHE_TIMEOUT_MS) });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.grievances) && json.grievances.length > 0) {
        return json.grievances.map(normalizeGrievance);
      }
    }
  } catch {}

  return fetchAllGrievances(runner);
}

/**
 * Attempts fast read of departments with on-chain fallback.
 */
export async function getCachedActiveDepartments(runner) {
  try {
    const url = `${BACKEND_BASE_URL}/api/cached/departments`;
    const res = await fetch(url, { signal: AbortSignal.timeout(CACHE_TIMEOUT_MS) });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.departments) && json.departments.length > 0) {
        return json.departments.map((d) => ({
          id: Number(d.department_id || d.id),
          name: d.name,
          admin: d.admin_address,
          isActive: Boolean(d.is_active),
        }));
      }
    }
  } catch {}

  return fetchActiveDepartmentsOnChain(runner);
}

/**
 * Attempts fast read of categories with on-chain fallback.
 */
export async function getCachedActiveCategories(runner, departmentId = null) {
  try {
    const q = departmentId ? `?department_id=${encodeURIComponent(departmentId)}` : '';
    const url = `${BACKEND_BASE_URL}/api/cached/categories${q}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(CACHE_TIMEOUT_MS) });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.categories) && json.categories.length > 0) {
        return json.categories.map((c) => ({
          id: Number(c.category_id || c.id),
          departmentId: Number(c.department_id),
          name: c.name,
          isActive: Boolean(c.is_active),
        }));
      }
    }
  } catch {}

  return fetchActiveCategoriesOnChain(runner);
}

/**
 * Verifies a cached grievance record against the authoritative blockchain.
 * Returns authoritative state and indicates whether cache was in sync.
 */
export async function verifyGrievanceWithBlockchain(runner, grievanceId, cachedGrievance = null) {
  const onChain = await fetchGrievanceDetails(runner, grievanceId);
  if (!cachedGrievance) {
    return { verified: true, onChain, matches: true };
  }

  const matches = (
    Number(onChain.status) === Number(cachedGrievance.status) &&
    (onChain.assignedOfficer || '').toLowerCase() === (cachedGrievance.assignedOfficer || '').toLowerCase() &&
    Number(onChain.departmentId) === Number(cachedGrievance.departmentId) &&
    Number(onChain.categoryId) === Number(cachedGrievance.categoryId) &&
    Number(onChain.priority) === Number(cachedGrievance.priority)
  );

  return {
    verified: true,
    onChain,
    matches,
    authoritativeState: onChain,
  };
}
