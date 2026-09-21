import { isValidAddress } from '../utils/formatters.js';
 
const env =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : typeof process !== 'undefined'
      ? process.env
      : {};

/**
 * Smart contract addresses configured via environment variables.
 * In Step 10 Foundation, these default to empty strings if not configured.
 */
export const CONTRACT_ADDRESSES = {
  RoleManager: env.VITE_ROLE_MANAGER_ADDRESS || '',
  DepartmentManager: env.VITE_DEPARTMENT_MANAGER_ADDRESS || '',
  GrievanceSystem: env.VITE_GRIEVANCE_SYSTEM_ADDRESS || '',
  EscalationManager: env.VITE_ESCALATION_MANAGER_ADDRESS || '',
  AuditTrail: env.VITE_AUDIT_TRAIL_ADDRESS || '',
};

/**
 * Programmatically updates a contract address in memory (used by tests or runtime switching).
 * @param {string} contractKey
 * @param {string} address
 */
export function setContractAddress(contractKey, address) {
  if (CONTRACT_ADDRESSES.hasOwnProperty(contractKey)) {
    CONTRACT_ADDRESSES[contractKey] = address;
  }
}

export const CONTRACT_NAMES = [
  { key: 'RoleManager', label: 'Role Manager', description: 'RBAC Authorization & User Registration' },
  { key: 'DepartmentManager', label: 'Department Manager', description: 'Department Directory & Categories' },
  { key: 'GrievanceSystem', label: 'Grievance System', description: 'Core Grievance Lifecycle & Investigations' },
  { key: 'EscalationManager', label: 'Escalation Manager', description: 'SLA Escalations & Reallocations' },
  { key: 'AuditTrail', label: 'Audit Trail', description: 'Immutable On-Chain Forensic Log' },
];

/**
 * Validates whether all required smart contracts are configured with valid Ethereum addresses.
 * @returns {{ isConfigured: boolean, hasAnyConfigured: boolean, missing: string[], configured: string[], statusMessage: string }}
 */
export function getContractConfigurationStatus() {
  const missing = [];
  const configured = [];

  for (const item of CONTRACT_NAMES) {
    const addr = CONTRACT_ADDRESSES[item.key];
    if (addr && isValidAddress(addr)) {
      configured.push(item.key);
    } else {
      missing.push(item.key);
    }
  }

  const isConfigured = missing.length === 0;

  return {
    isConfigured,
    hasAnyConfigured: configured.length > 0,
    missing,
    configured,
    statusMessage: isConfigured
      ? 'All smart contracts configured.'
      : 'Contract deployment configuration incomplete.',
  };
}

/**
 * Checks if a specific contract has a valid deployed address.
 * @param {string} contractKey
 * @returns {boolean}
 */
export function isContractConfigured(contractKey) {
  const addr = CONTRACT_ADDRESSES[contractKey];
  return isValidAddress(addr);
}

/**
 * Verifies that bytecode exists at all configured contract addresses via an active ethers provider.
 * @param {import('ethers').Provider} provider
 * @returns {Promise<{ allVerified: boolean, results: Record<string, { configured: boolean, hasBytecode: boolean, address: string }> }>}
 */
export async function verifyContractBytecode(provider) {
  const results = {};
  let allVerified = true;

  for (const item of CONTRACT_NAMES) {
    const addr = CONTRACT_ADDRESSES[item.key];
    const isConfig = Boolean(addr && isValidAddress(addr));
    let hasBytecode = false;

    if (isConfig && provider && typeof provider.getCode === 'function') {
      try {
        const code = await provider.getCode(addr);
        hasBytecode = Boolean(code && code !== '0x' && code !== '0x0');
      } catch (err) {
        console.warn(`[verifyContractBytecode] Could not verify bytecode for ${item.key}:`, err);
        hasBytecode = false;
      }
    }

    if (!isConfig || !hasBytecode) {
      allVerified = false;
    }

    results[item.key] = {
      address: addr || '',
      configured: isConfig,
      hasBytecode,
    };
  }

  return { allVerified, results };
}
