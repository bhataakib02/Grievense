import { getDepartmentManagerContract, getRoleManagerContract } from './blockchain.js';
import { isContractConfigured } from '../contracts/addresses.js';
import { ethers } from 'ethers';

/**
 * Normalizes revert / error messages into user-friendly strings using contract interface error decoding.
 */
export function parseDepartmentError(err, contract = null) {
  if (!err) return 'An unknown error occurred.';

  // Check direct revert name if already parsed by ethers v6
  let customErrorName = err?.revert?.name || null;

  // Try extracting hex data from error payload and parsing with contract interface
  if (!customErrorName && contract?.interface) {
    const rawData =
      err?.data ||
      err?.info?.error?.data ||
      err?.error?.data ||
      err?.payload?.params?.[0]?.data;
    if (rawData && typeof rawData === 'string' && rawData.startsWith('0x')) {
      try {
        const parsed = contract.interface.parseError(rawData);
        if (parsed) customErrorName = parsed.name;
      } catch {}
    }
  }

  const errString = `${err?.reason || ''} ${err?.message || ''} ${customErrorName || ''}`;

  if (customErrorName === 'NotADepartmentAdmin' || errString.includes('NotADepartmentAdmin')) {
    return 'This wallet does not have the Department Admin role. Grant DEPARTMENT_ADMIN_ROLE first.';
  }
  if (customErrorName === 'Unauthorized' || errString.includes('Unauthorized')) {
    return 'Unauthorized: You do not have permission for this department action.';
  }
  if (customErrorName === 'DepartmentAlreadyActive' || errString.includes('DepartmentAlreadyActive')) {
    return 'This department is already active.';
  }
  if (customErrorName === 'DepartmentNotActive' || errString.includes('DepartmentNotActive')) {
    return 'This department is currently deactivated.';
  }
  if (customErrorName === 'DepartmentNotFound' || errString.includes('DepartmentNotFound')) {
    return 'Department not found.';
  }
  if (customErrorName === 'CategoryNotFound' || errString.includes('CategoryNotFound')) {
    return 'Category not found.';
  }
  if (customErrorName === 'CategoryNotActive' || errString.includes('CategoryNotActive')) {
    return 'This category is currently deactivated.';
  }
  if (customErrorName === 'CategoryAlreadyActive' || errString.includes('CategoryAlreadyActive')) {
    return 'This category is already active.';
  }
  if (customErrorName === 'CategoryNotInDepartment' || errString.includes('CategoryNotInDepartment')) {
    return 'This category does not belong to the selected department.';
  }
  if (customErrorName === 'OfficerAlreadyInDepartment' || errString.includes('OfficerAlreadyInDepartment')) {
    return 'This officer is already a member of this department.';
  }
  if (customErrorName === 'OfficerNotInDepartment' || errString.includes('OfficerNotInDepartment')) {
    return 'This officer is not assigned to this department.';
  }
  if (customErrorName === 'NotAnOfficer' || errString.includes('NotAnOfficer')) {
    return 'Target address does not hold the Officer role in the system.';
  }
  if (customErrorName === 'EmptyString' || errString.includes('EmptyString')) {
    return 'Name cannot be empty.';
  }
  if (customErrorName === 'ZeroAddressNotAllowed' || errString.includes('ZeroAddressNotAllowed')) {
    return 'Zero address (0x00...00) is not allowed.';
  }
  if (customErrorName === 'DepartmentAdminNotAssigned' || errString.includes('DepartmentAdminNotAssigned')) {
    return 'No department admin is currently assigned to this department.';
  }

  // If user rejected in wallet
  if (err?.code === 4001 || err?.code === 'ACTION_REJECTED' || (err?.message && err.message.includes('user rejected'))) {
    return 'Transaction rejected by user in wallet.';
  }

  if (err?.shortMessage && !err.shortMessage.includes('unknown custom error')) {
    return err.shortMessage;
  }
  if (err?.message && !err.message.includes('unknown custom error')) {
    return err.message;
  }
  return 'Department transaction failed or was reverted on-chain.';
}

/**
 * Fetches all departments (both active and inactive) from DepartmentManager.
 * @param {import('ethers').ContractRunner} runner
 * @returns {Promise<Array<{ id: number, name: string, admin: string, isActive: boolean, createdAt: number, updatedAt: number }>>}
 */
export async function fetchAllDepartments(runner) {
  if (!isContractConfigured('DepartmentManager') || !runner) return [];

  const contract = getDepartmentManagerContract(runner);
  const count = Number(await contract.getDepartmentCount());
  if (count === 0) return [];

  const promises = [];
  for (let i = 1; i <= count; i++) {
    promises.push(contract.getDepartment(i));
  }

  const results = await Promise.allSettled(promises);
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => {
      const dept = r.value;
      return {
        id: Number(dept.id),
        name: dept.name,
        admin: dept.admin,
        isActive: Boolean(dept.isActive),
        createdAt: Number(dept.createdAt),
        updatedAt: Number(dept.updatedAt),
      };
    });
}

/**
 * Fetches only active departments.
 * @param {import('ethers').ContractRunner} runner
 * @returns {Promise<Array<{ id: number, name: string, admin: string, isActive: boolean, createdAt: number, updatedAt: number }>>}
 */
export async function fetchActiveDepartments(runner) {
  const all = await fetchAllDepartments(runner);
  return all.filter((d) => d.isActive);
}

/**
 * Fetches a single department by ID.
 * @param {import('ethers').ContractRunner} runner
 * @param {number} departmentId
 */
export async function fetchDepartment(runner, departmentId) {
  if (!isContractConfigured('DepartmentManager') || !runner) return null;
  const contract = getDepartmentManagerContract(runner);
  const dept = await contract.getDepartment(departmentId);
  return {
    id: Number(dept.id),
    name: dept.name,
    admin: dept.admin,
    isActive: Boolean(dept.isActive),
    createdAt: Number(dept.createdAt),
    updatedAt: Number(dept.updatedAt),
  };
}

/**
 * Fetches all officer wallet addresses currently in a department.
 * @param {import('ethers').ContractRunner} runner
 * @param {number} departmentId
 * @returns {Promise<string[]>}
 */
export async function fetchDepartmentOfficers(runner, departmentId) {
  if (!isContractConfigured('DepartmentManager') || !runner) return [];
  const contract = getDepartmentManagerContract(runner);
  return await contract.getDepartmentOfficers(departmentId);
}

/**
 * Fetches all department IDs an officer belongs to.
 * @param {import('ethers').ContractRunner} runner
 * @param {string} officerAddress
 * @returns {Promise<number[]>}
 */
export async function fetchOfficerDepartments(runner, officerAddress) {
  if (!isContractConfigured('DepartmentManager') || !runner) return [];
  const contract = getDepartmentManagerContract(runner);
  const deptIds = await contract.getOfficerDepartments(officerAddress);
  return deptIds.map((id) => Number(id));
}

/**
 * Checks if an officer is a member of a department.
 * @param {import('ethers').ContractRunner} runner
 * @param {number} departmentId
 * @param {string} officerAddress
 * @returns {Promise<boolean>}
 */
export async function isOfficerInDepartment(runner, departmentId, officerAddress) {
  if (!isContractConfigured('DepartmentManager') || !runner) return false;
  const contract = getDepartmentManagerContract(runner);
  return await contract.isOfficerInDepartment(departmentId, officerAddress);
}

/**
 * Fetches all grievance categories (both active and inactive).
 * @param {import('ethers').ContractRunner} runner
 * @returns {Promise<Array<{ id: number, name: string, description: string, isActive: boolean, createdAt: number }>>}
 */
export async function fetchAllCategories(runner) {
  if (!isContractConfigured('DepartmentManager') || !runner) return [];
  const contract = getDepartmentManagerContract(runner);
  const count = Number(await contract.getCategoryCount());
  if (count === 0) return [];

  const promises = [];
  for (let i = 1; i <= count; i++) {
    promises.push(contract.getCategory(i));
  }

  const results = await Promise.allSettled(promises);
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => {
      const cat = r.value;
      return {
        id: Number(cat.id),
        departmentId: Number(cat.departmentId || 0),
        name: cat.name,
        description: cat.description,
        isActive: Boolean(cat.isActive),
        createdAt: Number(cat.createdAt),
      };
    });
}

/**
 * Fetches only active categories.
 * @param {import('ethers').ContractRunner} runner
 * @returns {Promise<Array<{ id: number, departmentId: number, name: string, description: string, isActive: boolean, createdAt: number }>>}
 */
export async function fetchActiveCategories(runner) {
  const all = await fetchAllCategories(runner);
  return all.filter((c) => c.isActive);
}

/**
 * Fetches all categories belonging to a specific department.
 * @param {import('ethers').ContractRunner} runner
 * @param {number} departmentId
 * @returns {Promise<Array<object>>}
 */
export async function fetchDepartmentCategories(runner, departmentId) {
  if (!isContractConfigured('DepartmentManager') || !runner || !departmentId) return [];
  const contract = getDepartmentManagerContract(runner);
  try {
    if (typeof contract.getDepartmentCategories === 'function') {
      const ids = await contract.getDepartmentCategories(departmentId);
      if (ids && ids.length > 0) {
        const catPromises = ids.map((id) => contract.getCategory(id));
        const results = await Promise.allSettled(catPromises);
        return results
          .filter((r) => r.status === 'fulfilled')
          .map((r) => {
            const cat = r.value;
            return {
              id: Number(cat.id),
              departmentId: Number(cat.departmentId !== undefined ? cat.departmentId : departmentId),
              name: cat.name,
              description: cat.description,
              isActive: Boolean(cat.isActive),
              createdAt: Number(cat.createdAt),
            };
          });
      } else if (ids && ids.length === 0) {
        return [];
      }
    }
  } catch (err) {
    console.warn('getDepartmentCategories call failed, falling back to fetchAllCategories scan:', err);
  }
  const all = await fetchAllCategories(runner);
  return all.filter((c) => Number(c.departmentId) === Number(departmentId));
}

// ========================================================================
// WRITE FUNCTIONS
// ========================================================================

/**
 * Super Admin: Creates a new department.
 */
export async function createDepartment(signer, name, adminAddress) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.createDepartment(name.trim(), adminAddress);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin: Updates a department's name.
 */
export async function updateDepartment(signer, departmentId, newName) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.updateDepartment(departmentId, newName.trim());
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin: Deactivates a department.
 */
export async function deactivateDepartment(signer, departmentId) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.deactivateDepartment(departmentId);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin: Changes the admin for a department.
 */
export async function setDepartmentAdmin(signer, departmentId, newAdminAddress) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.setDepartmentAdmin(departmentId, newAdminAddress);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin or Assigned Dept Admin: Adds an officer to a department.
 */
export async function addOfficerToDepartment(signer, departmentId, officerAddress) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.addOfficerToDepartment(departmentId, officerAddress);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin or Assigned Dept Admin: Removes an officer from a department.
 */
export async function removeOfficerFromDepartment(signer, departmentId, officerAddress) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.removeOfficerFromDepartment(departmentId, officerAddress);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin or Department Admin: Creates a new grievance category.
 * Supports:
 * - createCategory(signer, departmentId, name, description)
 * - createCategory(signer, name, description)
 */
export async function createCategory(signer, arg1, arg2, arg3) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    let tx;
    if (arg3 !== undefined) {
      // (signer, departmentId, name, description)
      const method = contract['createCategory(uint256,string,string)'];
      if (typeof method === 'function') {
        tx = await method(arg1, arg2.trim(), arg3.trim());
      } else {
        tx = await contract.createCategory(arg1, arg2.trim(), arg3.trim());
      }
    } else {
      // (signer, name, description)
      const method = contract['createCategory(string,string)'];
      if (typeof method === 'function') {
        tx = await method(arg1.trim(), arg2.trim());
      } else {
        tx = await contract.createCategory(arg1.trim(), arg2.trim());
      }
    }
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin or Department Admin: Updates an existing category.
 */
export async function updateCategory(signer, categoryId, name, description) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.updateCategory(categoryId, name.trim(), description.trim());
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin or Department Admin: Deactivates a category.
 */
export async function deactivateCategory(signer, categoryId) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.deactivateCategory(categoryId);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin: Reactivates an inactive department.
 */
export async function reactivateDepartment(signer, departmentId) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.reactivateDepartment(departmentId);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin: Removes the department admin from a department.
 */
export async function removeDepartmentAdmin(signer, departmentId) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.removeDepartmentAdmin(departmentId);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin or Department Admin: Reactivates a category.
 */
export async function reactivateCategory(signer, categoryId) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.reactivateCategory(categoryId);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Super Admin or Department Admin: Transfers an officer between departments.
 */
export async function transferOfficerDepartment(signer, officerAddress, fromDepartmentId, toDepartmentId) {
  let contract;
  try {
    contract = getDepartmentManagerContract(signer);
    const tx = await contract.transferOfficerDepartment(officerAddress, fromDepartmentId, toDepartmentId);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err, contract));
  }
}

/**
 * Queries all addresses that currently hold DEPARTMENT_ADMIN_ROLE in RoleManager.
 * Uses historical department admins and RoleGranted events, strictly validated against isDepartmentAdmin.
 * @param {import('ethers').ContractRunner} runner
 * @returns {Promise<string[]>}
 */
export async function fetchEligibleDepartmentAdmins(runner) {
  if (!isContractConfigured('RoleManager') || !runner) return [];
  try {
    const roleContract = getRoleManagerContract(runner);
    const deptAdminRole = await roleContract.DEPARTMENT_ADMIN_ROLE();
    const candidateSet = new Set();

    // 1. Scan current department records
    try {
      const depts = await fetchAllDepartments(runner);
      depts.forEach((d) => {
        if (d.admin && d.admin !== ethers.ZeroAddress) {
          candidateSet.add(d.admin.toLowerCase());
        }
      });
    } catch {}

    // 2. Query RoleGranted events for DEPARTMENT_ADMIN_ROLE
    try {
      const filter = roleContract.filters.RoleGranted(deptAdminRole);
      const provider = runner.provider || runner;
      if (typeof provider.getBlockNumber === 'function') {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 45000);
        const events = await roleContract.queryFilter(filter, fromBlock, 'latest');
        events.forEach((e) => {
          if (e.args?.account) candidateSet.add(e.args.account.toLowerCase());
        });
      }
    } catch (evtErr) {
      console.warn('RoleGranted query warning:', evtErr);
    }

    // 3. Authoritatively verify with isDepartmentAdmin(addr)
    const verifiedAdmins = [];
    for (const addr of candidateSet) {
      try {
        const hasRole = await roleContract.isDepartmentAdmin(addr);
        if (hasRole) {
          verifiedAdmins.push(ethers.getAddress(addr));
        }
      } catch {}
    }
    return verifiedAdmins;
  } catch (err) {
    console.error('Failed to fetch eligible department admins:', err);
    return [];
  }
}

/**
 * Checks if an address is admin for a specific department.
 */
export async function isDepartmentAdminFor(runner, departmentId, adminAddress) {
  if (!isContractConfigured('DepartmentManager') || !runner || !adminAddress) return false;
  try {
    const contract = getDepartmentManagerContract(runner);
    return await contract.isDepartmentAdminFor(departmentId, adminAddress);
  } catch {
    return false;
  }
}

/**
 * Returns all department IDs an admin manages.
 */
export async function getAdminDepartments(runner, adminAddress) {
  if (!isContractConfigured('DepartmentManager') || !runner || !adminAddress) return [];
  try {
    const contract = getDepartmentManagerContract(runner);
    const depts = await contract.getAdminDepartments(adminAddress);
    return depts.map((id) => Number(id));
  } catch {
    return [];
  }
}

