import { getDepartmentManagerContract } from './blockchain.js';
import { isContractConfigured } from '../contracts/addresses.js';

/**
 * Normalizes revert / error messages into user-friendly strings.
 */
function parseDepartmentError(err) {
  const errString = err?.reason || err?.message || '';
  if (errString.includes('DepartmentNotFound')) {
    return 'Department not found.';
  }
  if (errString.includes('DepartmentNotActive')) {
    return 'This department is currently deactivated.';
  }
  if (errString.includes('OfficerAlreadyInDepartment')) {
    return 'This officer is already a member of this department.';
  }
  if (errString.includes('OfficerNotInDepartment')) {
    return 'This officer is not assigned to this department.';
  }
  if (errString.includes('NotAnOfficer')) {
    return 'Target address does not hold the Officer role in the system.';
  }
  if (errString.includes('NotADepartmentAdmin')) {
    return 'Target address does not hold the Department Admin role in the system.';
  }
  if (errString.includes('Unauthorized')) {
    return 'Unauthorized: You do not have permission for this department action.';
  }
  if (errString.includes('EmptyString')) {
    return 'Name cannot be empty.';
  }
  if (errString.includes('ZeroAddressNotAllowed')) {
    return 'Zero address is not allowed.';
  }
  return err?.shortMessage || err?.message || 'Department transaction failed.';
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
 * @returns {Promise<Array<{ id: number, name: string, description: string, isActive: boolean, createdAt: number }>>}
 */
export async function fetchActiveCategories(runner) {
  const all = await fetchAllCategories(runner);
  return all.filter((c) => c.isActive);
}

// ========================================================================
// WRITE FUNCTIONS
// ========================================================================

/**
 * Super Admin: Creates a new department.
 */
export async function createDepartment(signer, name, adminAddress) {
  try {
    const contract = getDepartmentManagerContract(signer);
    const tx = await contract.createDepartment(name.trim(), adminAddress);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err));
  }
}

/**
 * Super Admin: Updates a department's name.
 */
export async function updateDepartment(signer, departmentId, newName) {
  try {
    const contract = getDepartmentManagerContract(signer);
    const tx = await contract.updateDepartment(departmentId, newName.trim());
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err));
  }
}

/**
 * Super Admin: Deactivates a department (permanent - contract has no reactivate).
 */
export async function deactivateDepartment(signer, departmentId) {
  try {
    const contract = getDepartmentManagerContract(signer);
    const tx = await contract.deactivateDepartment(departmentId);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err));
  }
}

/**
 * Super Admin: Changes the admin for a department.
 */
export async function setDepartmentAdmin(signer, departmentId, newAdminAddress) {
  try {
    const contract = getDepartmentManagerContract(signer);
    const tx = await contract.setDepartmentAdmin(departmentId, newAdminAddress);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err));
  }
}

/**
 * Super Admin or Assigned Dept Admin: Adds an officer to a department.
 */
export async function addOfficerToDepartment(signer, departmentId, officerAddress) {
  try {
    const contract = getDepartmentManagerContract(signer);
    const tx = await contract.addOfficerToDepartment(departmentId, officerAddress);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err));
  }
}

/**
 * Super Admin or Assigned Dept Admin: Removes an officer from a department.
 */
export async function removeOfficerFromDepartment(signer, departmentId, officerAddress) {
  try {
    const contract = getDepartmentManagerContract(signer);
    const tx = await contract.removeOfficerFromDepartment(departmentId, officerAddress);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err));
  }
}

/**
 * Super Admin: Creates a new grievance category.
 */
export async function createCategory(signer, name, description) {
  try {
    const contract = getDepartmentManagerContract(signer);
    const tx = await contract.createCategory(name.trim(), description.trim());
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err));
  }
}

/**
 * Super Admin: Updates an existing category.
 */
export async function updateCategory(signer, categoryId, name, description) {
  try {
    const contract = getDepartmentManagerContract(signer);
    const tx = await contract.updateCategory(categoryId, name.trim(), description.trim());
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err));
  }
}

/**
 * Super Admin: Deactivates a category.
 */
export async function deactivateCategory(signer, categoryId) {
  try {
    const contract = getDepartmentManagerContract(signer);
    const tx = await contract.deactivateCategory(categoryId);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseDepartmentError(err));
  }
}
