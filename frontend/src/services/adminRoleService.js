import { getRoleManagerContract } from './blockchain.js';
import { isContractConfigured } from '../contracts/addresses.js';

function parseRoleError(err) {
  const errString = err?.reason || err?.message || '';
  if (errString.includes('CannotRevokeLastSuperAdmin')) {
    return 'Cannot revoke role: System lockout protection prevents removing the last Super Admin.';
  }
  if (errString.includes('ZeroAddressNotAllowed')) {
    return 'Zero address is not allowed.';
  }
  if (errString.includes('Unauthorized')) {
    return 'Unauthorized: Caller does not have permission to manage this role.';
  }
  return err?.shortMessage || err?.message || 'Role management transaction failed.';
}

/**
 * Super Admin or Department Admin: Grants OFFICER_ROLE to an account.
 */
export async function grantOfficerRole(signer, account) {
  try {
    const contract = getRoleManagerContract(signer);
    const tx = await contract.grantOfficerRole(account);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseRoleError(err));
  }
}

/**
 * Super Admin or Department Admin: Revokes OFFICER_ROLE from an account.
 */
export async function revokeOfficerRole(signer, account) {
  try {
    const contract = getRoleManagerContract(signer);
    const tx = await contract.revokeOfficerRole(account);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseRoleError(err));
  }
}

/**
 * Super Admin: Grants DEPARTMENT_ADMIN_ROLE to an account.
 */
export async function grantDepartmentAdminRole(signer, account) {
  try {
    const contract = getRoleManagerContract(signer);
    const tx = await contract.grantDepartmentAdminRole(account);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseRoleError(err));
  }
}

/**
 * Super Admin: Revokes DEPARTMENT_ADMIN_ROLE from an account.
 */
export async function revokeDepartmentAdminRole(signer, account) {
  try {
    const contract = getRoleManagerContract(signer);
    const tx = await contract.revokeDepartmentAdminRole(account);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseRoleError(err));
  }
}

/**
 * Super Admin: Grants SUPER_ADMIN_ROLE to an account.
 */
export async function grantSuperAdminRole(signer, account) {
  try {
    const contract = getRoleManagerContract(signer);
    const tx = await contract.grantSuperAdminRole(account);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseRoleError(err));
  }
}

/**
 * Super Admin: Revokes SUPER_ADMIN_ROLE from an account.
 */
export async function revokeSuperAdminRole(signer, account) {
  try {
    const contract = getRoleManagerContract(signer);
    const tx = await contract.revokeSuperAdminRole(account);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseRoleError(err));
  }
}

/**
 * Returns current count of Super Admins.
 */
export async function fetchSuperAdminCount(runner) {
  if (!isContractConfigured('RoleManager') || !runner) return 0;
  const contract = getRoleManagerContract(runner);
  const count = await contract.getSuperAdminCount();
  return Number(count);
}
