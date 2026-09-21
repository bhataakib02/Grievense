import { isContractConfigured } from '../contracts/addresses.js';
import { getRoleManagerContract } from './blockchain.js';

/**
 * Standard role identifier keys used in the frontend application.
 */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  DEPARTMENT_ADMIN: 'DEPARTMENT_ADMIN',
  OFFICER: 'OFFICER',
  CITIZEN: 'CITIZEN',
};

/**
 * Hierarchy priority for default dashboard selection (highest to lowest).
 */
export const ROLE_HIERARCHY = [
  ROLES.SUPER_ADMIN,
  ROLES.DEPARTMENT_ADMIN,
  ROLES.OFFICER,
  ROLES.CITIZEN,
];

/**
 * Human-readable labels and descriptions for each role.
 */
export const ROLE_METADATA = {
  [ROLES.SUPER_ADMIN]: {
    label: 'Super Admin',
    description: 'System-wide governance, departments, categories, and SLA configuration.',
    badgeVariant: 'danger',
    dashboardRoute: '#/super-admin',
  },
  [ROLES.DEPARTMENT_ADMIN]: {
    label: 'Department Admin',
    description: 'Departmental operations, triage, officer rosters, and assignments.',
    badgeVariant: 'neutral',
    dashboardRoute: '#/dept-admin',
  },
  [ROLES.OFFICER]: {
    label: 'Officer',
    description: 'Case investigation, evidence collection, and resolution submission.',
    badgeVariant: 'warning',
    dashboardRoute: '#/officer',
  },
  [ROLES.CITIZEN]: {
    label: 'Citizen',
    description: 'Grievance filing, tracking, evidence submission, and resolution confirmation.',
    badgeVariant: 'primary',
    dashboardRoute: '#/citizen',
  },
};

/**
 * Fetches the actual role hash constants directly from the deployed RoleManager contract.
 * @param {import('ethers').Contract} roleManagerContract
 * @returns {Promise<{ SUPER_ADMIN_ROLE: string, DEPARTMENT_ADMIN_ROLE: string, OFFICER_ROLE: string, CITIZEN_ROLE: string }>}
 */
export async function fetchRoleConstants(roleManagerContract) {
  try {
    const [superAdminRole, deptAdminRole, officerRole, citizenRole] = await Promise.all([
      roleManagerContract.SUPER_ADMIN_ROLE(),
      roleManagerContract.DEPARTMENT_ADMIN_ROLE(),
      roleManagerContract.OFFICER_ROLE(),
      roleManagerContract.CITIZEN_ROLE(),
    ]);

    return {
      SUPER_ADMIN_ROLE: superAdminRole,
      DEPARTMENT_ADMIN_ROLE: deptAdminRole,
      OFFICER_ROLE: officerRole,
      CITIZEN_ROLE: citizenRole,
    };
  } catch (err) {
    console.error('Failed to fetch role constants from RoleManager:', err);
    throw err;
  }
}

/**
 * Queries the real on-chain roles and registration status for a given account.
 * Uses RoleManager.getActiveRoles() (with fallback to individual hasRole calls) and getUserProfile().
 *
 * @param {import('ethers').ContractRunner} runner - Ethers provider or signer
 * @param {string} accountAddress - Address to query
 * @returns {Promise<{
 *   isCitizen: boolean,
 *   isOfficer: boolean,
 *   isDeptAdmin: boolean,
 *   isSuperAdmin: boolean,
 *   activeRoles: string[],
 *   highestRole: string | null,
 *   isRegistered: boolean,
 *   registeredAt: number | null,
 *   superAdminCount: number
 * }>}
 */
export async function fetchUserRoles(runner, accountAddress) {
  if (!isContractConfigured('RoleManager') || !runner || !accountAddress) {
    return {
      isCitizen: false,
      isOfficer: false,
      isDeptAdmin: false,
      isSuperAdmin: false,
      activeRoles: [],
      highestRole: null,
      isRegistered: false,
      registeredAt: null,
      superAdminCount: 0,
    };
  }

  const roleManager = getRoleManagerContract(runner);

  let isCitizen = false;
  let isOfficer = false;
  let isDeptAdmin = false;
  let isSuperAdmin = false;

  // Try the gas-free convenience function getActiveRoles(account)
  try {
    const [cit, off, dept, sup] = await roleManager.getActiveRoles(accountAddress);
    isCitizen = Boolean(cit);
    isOfficer = Boolean(off);
    isDeptAdmin = Boolean(dept);
    isSuperAdmin = Boolean(sup);
  } catch (e) {
    console.warn('getActiveRoles failed, falling back to individual role constant checks:', e);
    try {
      const constants = await fetchRoleConstants(roleManager);
      const [cit, off, dept, sup] = await Promise.all([
        roleManager.hasRole(constants.CITIZEN_ROLE, accountAddress),
        roleManager.hasRole(constants.OFFICER_ROLE, accountAddress),
        roleManager.hasRole(constants.DEPARTMENT_ADMIN_ROLE, accountAddress),
        roleManager.hasRole(constants.SUPER_ADMIN_ROLE, accountAddress),
      ]);
      isCitizen = Boolean(cit);
      isOfficer = Boolean(off);
      isDeptAdmin = Boolean(dept);
      isSuperAdmin = Boolean(sup);
    } catch (fallbackErr) {
      console.error('All role query methods failed:', fallbackErr);
      throw fallbackErr;
    }
  }

  // Compile active roles array
  const activeRoles = [];
  if (isSuperAdmin) activeRoles.push(ROLES.SUPER_ADMIN);
  if (isDeptAdmin) activeRoles.push(ROLES.DEPARTMENT_ADMIN);
  if (isOfficer) activeRoles.push(ROLES.OFFICER);
  if (isCitizen) activeRoles.push(ROLES.CITIZEN);

  // Determine highest priority role
  const highestRole = ROLE_HIERARCHY.find((r) => activeRoles.includes(r)) || null;

  // Check registration profile and system super admin count
  let isRegistered = false;
  let registeredAt = null;
  let superAdminCount = 0;

  try {
    const profile = await roleManager.getUserProfile(accountAddress);
    isRegistered = Boolean(profile.isRegistered);
    registeredAt = profile.registeredAt ? Number(profile.registeredAt) : null;
  } catch (err) {
    console.warn('Could not read user profile:', err);
  }

  try {
    const count = await roleManager.getSuperAdminCount();
    superAdminCount = Number(count);
  } catch (err) {
    console.warn('Could not read super admin count:', err);
  }

  return {
    isCitizen,
    isOfficer,
    isDeptAdmin,
    isSuperAdmin,
    activeRoles,
    highestRole,
    isRegistered,
    registeredAt,
    superAdminCount,
  };
}

/**
 * Executes on-chain citizen self-registration via registerCitizen().
 * @param {import('ethers').Signer} signer
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function registerCitizen(signer) {
  if (!isContractConfigured('RoleManager')) {
    throw new Error('RoleManager contract is not configured.');
  }

  const roleManager = getRoleManagerContract(signer);
  const tx = await roleManager.registerCitizen();
  const receipt = await tx.wait();
  return receipt;
}
