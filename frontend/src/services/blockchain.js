import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, isContractConfigured } from '../contracts/addresses.js';

import RoleManagerAbi from '../contracts/abis/RoleManager.json' with { type: 'json' };
import DepartmentManagerAbi from '../contracts/abis/DepartmentManager.json' with { type: 'json' };
import GrievanceSystemAbi from '../contracts/abis/GrievanceSystem.json' with { type: 'json' };
import EscalationManagerAbi from '../contracts/abis/EscalationManager.json' with { type: 'json' };
import AuditTrailAbi from '../contracts/abis/AuditTrail.json' with { type: 'json' };

export const CONTRACT_ABIS = {
  RoleManager: RoleManagerAbi,
  DepartmentManager: DepartmentManagerAbi,
  GrievanceSystem: GrievanceSystemAbi,
  EscalationManager: EscalationManagerAbi,
  AuditTrail: AuditTrailAbi,
};

/**
 * Creates an ethers.Contract instance for a specified system contract.
 * @param {string} contractName - Name of the contract
 * @param {ethers.ContractRunner} runner - Provider or Signer
 * @returns {ethers.Contract}
 */
export function getContractInstance(contractName, runner) {
  if (!isContractConfigured(contractName)) {
    throw new Error(
      `Smart contract "${contractName}" is not configured. Please set VITE_${contractName.toUpperCase()}_ADDRESS in .env.`
    );
  }

  const address = CONTRACT_ADDRESSES[contractName];
  const abi = CONTRACT_ABIS[contractName];

  if (!abi) {
    throw new Error(`ABI for "${contractName}" not found.`);
  }

  return new ethers.Contract(address, abi, runner);
}

export function getRoleManagerContract(runner) {
  return getContractInstance('RoleManager', runner);
}

export function getDepartmentManagerContract(runner) {
  return getContractInstance('DepartmentManager', runner);
}

export function getGrievanceSystemContract(runner) {
  return getContractInstance('GrievanceSystem', runner);
}

export function getEscalationManagerContract(runner) {
  return getContractInstance('EscalationManager', runner);
}

export function getAuditTrailContract(runner) {
  return getContractInstance('AuditTrail', runner);
}
