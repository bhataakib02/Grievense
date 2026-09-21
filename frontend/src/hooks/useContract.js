import { useMemo } from 'react';
import { useWallet } from './useWallet';
import {
  getRoleManagerContract,
  getDepartmentManagerContract,
  getGrievanceSystemContract,
  getEscalationManagerContract,
  getAuditTrailContract,
} from '../services/blockchain';
import {
  getContractConfigurationStatus,
  isContractConfigured,
  CONTRACT_ADDRESSES,
} from '../contracts/addresses';

/**
 * Custom hook providing contract instances and deployment configuration status.
 */
export function useContract() {
  const { provider, signer, isConnected } = useWallet();

  const configStatus = useMemo(() => getContractConfigurationStatus(), []);

  // Use signer if connected, else fallback to read-only provider if available
  const runner = signer || provider || null;

  const contracts = useMemo(() => {
    if (!runner) return null;

    const instances = {};

    try {
      if (isContractConfigured('RoleManager')) {
        instances.roleManager = getRoleManagerContract(runner);
      }
    } catch (e) {
      console.warn('RoleManager instance unavailable:', e);
    }

    try {
      if (isContractConfigured('DepartmentManager')) {
        instances.departmentManager = getDepartmentManagerContract(runner);
      }
    } catch (e) {
      console.warn('DepartmentManager instance unavailable:', e);
    }

    try {
      if (isContractConfigured('GrievanceSystem')) {
        instances.grievanceSystem = getGrievanceSystemContract(runner);
      }
    } catch (e) {
      console.warn('GrievanceSystem instance unavailable:', e);
    }

    try {
      if (isContractConfigured('EscalationManager')) {
        instances.escalationManager = getEscalationManagerContract(runner);
      }
    } catch (e) {
      console.warn('EscalationManager instance unavailable:', e);
    }

    try {
      if (isContractConfigured('AuditTrail')) {
        instances.auditTrail = getAuditTrailContract(runner);
      }
    } catch (e) {
      console.warn('AuditTrail instance unavailable:', e);
    }

    return instances;
  }, [runner]);

  return {
    contracts,
    addresses: CONTRACT_ADDRESSES,
    isConfigured: configStatus.isConfigured,
    hasAnyConfigured: configStatus.hasAnyConfigured,
    missingContracts: configStatus.missing,
    configuredContracts: configStatus.configured,
    canInteract: Boolean(isConnected && runner && configStatus.hasAnyConfigured),
  };
}
