import { isValidAddress } from '../utils/formatters.js';
import {
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
  CONTRACT_METADATA,
  isContractConfigured,
  getContractConfigurationStatus,
} from '../config/contracts.js';

export {
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
  CONTRACT_METADATA,
  isContractConfigured,
  getContractConfigurationStatus,
};

// Backwards compatibility alias
export const RPC_URL = SEPOLIA_RPC_URL;
export const CONTRACT_NAMES = CONTRACT_METADATA;

/**
 * Programmatically updates a contract address in memory (used by runtime testing if needed).
 * @param {string} contractKey
 * @param {string} address
 */
export function setContractAddress(contractKey, address) {
  if (Object.prototype.hasOwnProperty.call(CONTRACT_ADDRESSES, contractKey)) {
    CONTRACT_ADDRESSES[contractKey] = address;
  }
}

/**
 * Verifies that bytecode exists at all configured contract addresses via an active ethers provider.
 * @param {import('ethers').Provider} provider
 * @returns {Promise<{ allVerified: boolean, results: Record<string, { configured: boolean, hasBytecode: boolean, address: string }> }>}
 */
export async function verifyContractBytecode(provider) {
  const results = {};
  let allVerified = true;

  for (const item of CONTRACT_METADATA) {
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

export default {
  CONTRACT_ADDRESSES,
  TARGET_CHAIN_ID,
  TARGET_NETWORK_NAME,
  SEPOLIA_RPC_URL,
  SEPOLIA_EXPLORER_URL,
  CONTRACT_METADATA,
  isContractConfigured,
  getContractConfigurationStatus,
  verifyContractBytecode,
};
