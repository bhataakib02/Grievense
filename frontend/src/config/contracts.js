import { isValidAddress } from '../utils/formatters.js';

const env =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : typeof process !== 'undefined'
      ? process.env
      : {};

/**
 * Authoritative Smart Contract Addresses on Ethereum Sepolia (Chain ID: 11155111).
 * Configured via Vite environment variables in frontend/.env.
 */
export const ROLE_MANAGER_ADDRESS = env.VITE_ROLE_MANAGER_ADDRESS || '';
export const DEPARTMENT_MANAGER_ADDRESS = env.VITE_DEPARTMENT_MANAGER_ADDRESS || '';
export const GRIEVANCE_SYSTEM_ADDRESS = env.VITE_GRIEVANCE_SYSTEM_ADDRESS || '';
export const ESCALATION_MANAGER_ADDRESS = env.VITE_ESCALATION_MANAGER_ADDRESS || '';
export const AUDIT_TRAIL_ADDRESS = env.VITE_AUDIT_TRAIL_ADDRESS || '';

export const TARGET_CHAIN_ID = Number(env.VITE_CHAIN_ID || env.VITE_TARGET_CHAIN_ID || 11155111);
export const TARGET_NETWORK_NAME = env.VITE_NETWORK_NAME || 'Sepolia';
export const SEPOLIA_RPC_URL = env.VITE_RPC_URL || 'https://rpc.sepolia.org';
export const SEPOLIA_EXPLORER_URL = env.VITE_EXPLORER_URL || 'https://sepolia.etherscan.io';

export const CONTRACT_ADDRESSES = {
  RoleManager: ROLE_MANAGER_ADDRESS,
  DepartmentManager: DEPARTMENT_MANAGER_ADDRESS,
  GrievanceSystem: GRIEVANCE_SYSTEM_ADDRESS,
  EscalationManager: ESCALATION_MANAGER_ADDRESS,
  AuditTrail: AUDIT_TRAIL_ADDRESS,
};

export const CONTRACT_METADATA = [
  { key: 'RoleManager', label: 'Role Manager', address: ROLE_MANAGER_ADDRESS, description: 'Authoritative RBAC & Permission Verification' },
  { key: 'DepartmentManager', label: 'Department Manager', address: DEPARTMENT_MANAGER_ADDRESS, description: 'Department Directory, Categories & Officer Roster' },
  { key: 'GrievanceSystem', label: 'Grievance System', address: GRIEVANCE_SYSTEM_ADDRESS, description: 'Core Grievance Lifecycle, Intake & Investigations' },
  { key: 'EscalationManager', label: 'Escalation Manager', address: ESCALATION_MANAGER_ADDRESS, description: 'SLA Tracking & Reallocations' },
  { key: 'AuditTrail', label: 'Audit Trail', address: AUDIT_TRAIL_ADDRESS, description: 'Cryptographic On-Chain Forensic Action Log' },
];

/**
 * Checks if a specific contract has a valid Ethereum address configured.
 * @param {string} contractKey
 * @returns {boolean}
 */
export function isContractConfigured(contractKey) {
  const addr = CONTRACT_ADDRESSES[contractKey];
  return Boolean(addr && isValidAddress(addr));
}

/**
 * Detailed configuration audit for all 5 smart contracts.
 * Returns exact missing vs configured contract lists with individual status.
 */
export function getContractConfigurationStatus() {
  const missing = [];
  const configured = [];
  const statusDetails = {};

  for (const item of CONTRACT_METADATA) {
    const addr = CONTRACT_ADDRESSES[item.key];
    const isConfig = Boolean(addr && isValidAddress(addr));
    if (isConfig) {
      configured.push(item.key);
    } else {
      missing.push(item.key);
    }
    statusDetails[item.key] = {
      label: item.label,
      address: addr || '',
      isConfigured: isConfig,
    };
  }

  const isConfigured = missing.length === 0;

  return {
    isConfigured,
    hasAnyConfigured: configured.length > 0,
    missing,
    configured,
    statusDetails,
    statusMessage: isConfigured
      ? 'All smart contracts configured for Sepolia.'
      : `Missing addresses for: ${missing.join(', ')}. Configure in frontend/.env`,
  };
}

export default {
  ROLE_MANAGER_ADDRESS,
  DEPARTMENT_MANAGER_ADDRESS,
  GRIEVANCE_SYSTEM_ADDRESS,
  ESCALATION_MANAGER_ADDRESS,
  AUDIT_TRAIL_ADDRESS,
  TARGET_CHAIN_ID,
  TARGET_NETWORK_NAME,
  SEPOLIA_RPC_URL,
  SEPOLIA_EXPLORER_URL,
  CONTRACT_ADDRESSES,
  isContractConfigured,
  getContractConfigurationStatus,
};
