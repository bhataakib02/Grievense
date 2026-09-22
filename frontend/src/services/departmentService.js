import { getDepartmentManagerContract, getRoleManagerContract } from './blockchain.js';
import { isContractConfigured } from '../contracts/addresses.js';
import { ethers } from 'ethers';

/**
 * Normalizes revert / error messages into user-friendly strings using contract interface error decoding.
 */
const ABI_5_TUPLE = [
  'function getCategory(uint256) view returns (tuple(uint256 id, string name, string description, bool isActive, uint256 createdAt))'
];

/**
 * Safely fetches and decodes a category by ID from DepartmentManager,
 * seamlessly supporting both the deployed 5-tuple contract (no departmentId field)
 * and the updated 6-tuple contract (with departmentId field).
 */
export async function fetchCategorySafe(contract, id, runner) {
  try {
    const cat = await contract.getCategory(id);
    return {
      id: Number(cat.id),
      departmentId: Number(cat.departmentId !== undefined ? cat.departmentId : 0),
      name: cat.name,
      description: cat.description,
      isActive: Boolean(cat.isActive),
      createdAt: Number(cat.createdAt),
    };
  } catch {
    // Fallback to 5-tuple decoding for contracts deployed without departmentId field
    try {
      const targetAddress = contract.target || contract.address;
      const c5 = new ethers.Contract(targetAddress, ABI_5_TUPLE, runner);
      const cat = await c5.getCategory(id);
      return {
        id: Number(cat.id),
        departmentId: 0,
        name: cat.name,
        description: cat.description,
        isActive: Boolean(cat.isActive),
        createdAt: Number(cat.createdAt),
      };
    } catch (fallbackErr) {
      throw fallbackErr;
    }
  }
}

/**
 * Normalizes revert / error messages into user-friendly strings using contract interface error decoding.
 */
export function parseDepartmentError(err, contract = null) {
  if (!err) return 'An unknown error occurred.';

  // Check direct revert name if already parsed by ethers v6
  let customErrorName = err?.revert?.name || null;
  let customArgs = err?.revert?.args || null;

  // Try extracting hex data from error payload and parsing with contract interface
  const rawData =
    err?.data ||
    err?.info?.error?.data ||
    err?.error?.data ||
    err?.payload?.params?.[0]?.data;

  if (!customErrorName && rawData && typeof rawData === 'string' && rawData.startsWith('0x')) {
    if (contract?.interface) {
      try {
        const parsed = contract.interface.parseError(rawData);
        if (parsed) {
          customErrorName = parsed.name;
          customArgs = parsed.args;
        }
      } catch {}
    }
  }

  const errShort = String(err?.shortMessage || '');
  const errMsg = String(err?.message || '');
  const errReason = String(err?.reason || '');
  const fullErrText = `${errReason} ${errShort} ${errMsg} ${customErrorName || ''}`.toLowerCase();

  // 1. Intercept "missing revert data" with exact root cause explanation
  if (
    errShort.includes('missing revert data') ||
    errMsg.includes('missing revert data') ||
    (err?.code === 'CALL_EXCEPTION' && (!rawData || rawData === '0x'))
  ) {
    return (
      'Contract call failed ("missing revert data"). ' +
      'Root Cause: The deployed DepartmentManager on Sepolia (0xAE3F7f5886BFFE5850F240fc3D79218423b0ee74) ' +
      'does not contain the department-scoped createCategory(uint256,string,string) function (selector 0x2850beda). ' +
      'DepartmentManager must be redeployed to Sepolia to enable Department Admin category creation.'
    );
  }

  // 2. Unauthorized error handling
  if (customErrorName === 'Unauthorized' || fullErrText.includes('unauthorized')) {
    if (customArgs && customArgs.length >= 2) {
      return `Unauthorized: Caller ${customArgs[0]} lacks permission for this action (${customArgs[1]}).`;
    }
    return 'Unauthorized: Caller lacks the required role (Super Admin or assigned Department Admin for this department).';
  }

  // 3. User rejected in wallet
  if (err?.code === 4001 || err?.code === 'ACTION_REJECTED' || fullErrText.includes('user rejected')) {
    return 'Transaction was cancelled by user in MetaMask.';
  }

  if (customErrorName === 'NotADepartmentAdmin' || fullErrText.includes('notadepartmentadmin')) {
    return 'This wallet does not have the Department Admin role. Grant DEPARTMENT_ADMIN_ROLE in RoleManager first.';
  }
  if (customErrorName === 'DepartmentAlreadyActive' || fullErrText.includes('departmentalreadyactive')) {
    return 'This department is already active.';
  }
  if (customErrorName === 'DepartmentNotActive' || fullErrText.includes('departmentnotactive')) {
    return 'This department is currently deactivated.';
  }
  if (customErrorName === 'DepartmentNotFound' || fullErrText.includes('departmentnotfound')) {
    return 'Department not found on-chain.';
  }
  if (customErrorName === 'CategoryNotFound' || fullErrText.includes('categorynotfound')) {
    return 'Category not found on-chain.';
  }
  if (customErrorName === 'CategoryNotActive' || fullErrText.includes('categorynotactive')) {
    return 'This category is currently deactivated.';
  }
  if (customErrorName === 'CategoryAlreadyActive' || fullErrText.includes('categoryalreadyactive')) {
    return 'This category is already active.';
  }
  if (customErrorName === 'CategoryNotInDepartment' || fullErrText.includes('categorynotindepartment')) {
    return 'This category does not belong to the selected department.';
  }
  if (customErrorName === 'OfficerAlreadyInDepartment' || fullErrText.includes('officeralreadyindepartment')) {
    return 'This officer is already a member of this department.';
  }
  if (customErrorName === 'OfficerNotInDepartment' || fullErrText.includes('officernotindepartment')) {
    return 'This officer is not assigned to this department.';
  }
  if (customErrorName === 'NotAnOfficer' || fullErrText.includes('notanofficer')) {
    return 'Target address does not hold the Officer role in RoleManager.';
  }
  if (customErrorName === 'EmptyString' || fullErrText.includes('emptystring')) {
    return 'Required field cannot be empty.';
  }
  if (customErrorName === 'ZeroAddressNotAllowed' || fullErrText.includes('zeroaddressnotallowed')) {
    return 'Zero address (0x00...00) is not allowed.';
  }
  if (customErrorName === 'DepartmentAdminNotAssigned' || fullErrText.includes('departmentadminnotassigned')) {
    return 'No Department Admin is currently assigned to this department.';
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
    promises.push(fetchCategorySafe(contract, i, runner));
  }

  const results = await Promise.allSettled(promises);
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);
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
        const catPromises = ids.map((id) => fetchCategorySafe(contract, id, runner));
        const results = await Promise.allSettled(catPromises);
        return results
          .filter((r) => r.status === 'fulfilled')
          .map((r) => r.value);
      } else if (ids && ids.length === 0) {
        return [];
      }
    }
  } catch (err) {
    console.warn('getDepartmentCategories call failed, falling back to fetchAllCategories scan:', err);
  }
  const all = await fetchAllCategories(runner);
  // Match categories explicitly assigned to this department, or global legacy categories (departmentId = 0)
  return all.filter((c) => Number(c.departmentId) === Number(departmentId) || Number(c.departmentId) === 0);
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

/**
 * Performs read-only pre-flight validation before initiating a category creation transaction.
 * Validates:
 * 1. Current wallet connected
 * 2. Target network / Chain ID (Ethereum Sepolia: 11155111)
 * 3. Department ID validity
 * 4. Department exists on-chain
 * 5. Department is active
 * 6. Department Admin assigned
 * 7. Current wallet is assigned Department Admin or Super Admin
 * 8. Category name input validation
 * 9. Deployed contract capability check (verifies whether createCategory(uint256,string,string) is deployed)
 */
export async function validateCategoryCreationPreflight(runner, {
  callerAddress,
  chainId,
  departmentId,
  categoryName
}) {
  // 1. Current wallet
  if (!callerAddress || callerAddress === ethers.ZeroAddress) {
    return { valid: false, error: 'No wallet connected. Please connect MetaMask.' };
  }

  // 2. Current chain
  const expectedChainId = 11155111;
  if (chainId && Number(chainId) !== expectedChainId) {
    return {
      valid: false,
      error: `Incorrect network (Chain ID: ${chainId}). Please switch MetaMask to Ethereum Sepolia (Chain ID: ${expectedChainId}).`
    };
  }

  // 3. Department ID
  const deptIdNum = Number(departmentId);
  if (!deptIdNum || isNaN(deptIdNum) || deptIdNum <= 0) {
    return { valid: false, error: 'Invalid department ID specified.' };
  }

  // 8. Category input valid
  if (!categoryName || !categoryName.trim()) {
    return { valid: false, error: 'Category name is required.' };
  }
  if (categoryName.trim().length > 100) {
    return { valid: false, error: 'Category name exceeds maximum length (100 characters).' };
  }

  if (!runner || !isContractConfigured('DepartmentManager')) {
    return { valid: false, error: 'DepartmentManager contract is not configured.' };
  }

  try {
    const deptContract = getDepartmentManagerContract(runner);

    // 4. Department exists & 5. Department active
    let dept;
    try {
      dept = await deptContract.getDepartment(deptIdNum);
    } catch {
      return { valid: false, error: `Department #${deptIdNum} does not exist on-chain.` };
    }

    if (!dept || Number(dept.id) === 0) {
      return { valid: false, error: `Department #${deptIdNum} does not exist on-chain.` };
    }

    if (!dept.isActive) {
      return { valid: false, error: `Department #${deptIdNum} ("${dept.name}") is currently deactivated.` };
    }

    // 6. Department Admin assigned
    if (!dept.admin || dept.admin === ethers.ZeroAddress) {
      return { valid: false, error: `Department #${deptIdNum} has no assigned Department Admin.` };
    }

    // 7. Current wallet is Department Admin
    const isAssignedAdmin = dept.admin.toLowerCase() === callerAddress.toLowerCase();
    let isRoleAdmin = false;
    let isAuthForDept = false;

    if (isContractConfigured('RoleManager')) {
      try {
        const roleContract = getRoleManagerContract(runner);
        const isSuperAdmin = await roleContract.isSuperAdmin(callerAddress);
        if (isSuperAdmin) {
          isRoleAdmin = true;
          isAuthForDept = true;
        } else {
          isRoleAdmin = await roleContract.isDepartmentAdmin(callerAddress);
          if (typeof deptContract.isDepartmentAdminFor === 'function') {
            isAuthForDept = await deptContract.isDepartmentAdminFor(deptIdNum, callerAddress);
          } else {
            isAuthForDept = isAssignedAdmin && isRoleAdmin;
          }
        }
      } catch (err) {
        console.warn('Role verification warning during preflight:', err);
      }
    }

    if (!isAssignedAdmin && !isAuthForDept) {
      return {
        valid: false,
        error: `Wallet (${callerAddress.slice(0, 6)}...${callerAddress.slice(-4)}) is not authorized as Department Admin for Department #${deptIdNum} ("${dept.name}"). Assigned admin is ${dept.admin.slice(0, 6)}...${dept.admin.slice(-4)}.`
      };
    }

    // 9. Check on-chain contract capability for 3-argument department-scoped category creation
    try {
      const provider = runner.provider || runner;
      if (typeof provider.getCode === 'function') {
        const deptMgrAddress = deptContract.target || deptContract.address;
        const code = await provider.getCode(deptMgrAddress);
        const sel3 = ethers.id('createCategory(uint256,string,string)').slice(2, 10);
        if (!code.includes(sel3)) {
          return {
            valid: false,
            error: `On-Chain Contract Limitation: The deployed DepartmentManager contract at ${deptMgrAddress} does not implement department-scoped category creation (createCategory(uint256,string,string)). The contract only has the legacy global category creation reserved for Super Admin. Contract redeployment is required to enable Department Admin category creation.`
          };
        }
      }
    } catch (codeErr) {
      console.warn('Bytecode capability check warning:', codeErr);
    }

    return { valid: true, departmentName: dept.name, departmentId: deptIdNum };
  } catch (err) {
    return { valid: false, error: `Pre-flight validation check failed: ${err.message}` };
  }
}

