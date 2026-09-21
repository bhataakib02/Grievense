import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useContract } from '../hooks/useContract';
import {
  fetchUserRoles,
  registerCitizen,
  ROLES,
  ROLE_HIERARCHY,
  ROLE_METADATA,
} from '../services/roleService';
import { parseChainId } from '../utils/formatters.js';
import { RoleContext } from './RoleContextDefinition';

export function RoleProvider({ children }) {
  const { address, provider, signer, isConnected, chainId } = useWallet();
  const { isConfigured } = useContract();

  const [rolesState, setRolesState] = useState({
    isCitizen: false,
    isOfficer: false,
    isDeptAdmin: false,
    isSuperAdmin: false,
    activeRoles: [],
    highestRole: null,
    isRegistered: false,
    registeredAt: null,
    superAdminCount: 0,
  });

  // The active role view currently selected by the user (if they have multiple roles)
  const [currentRole, setCurrentRole] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Target chain validation from environment (strictly numeric)
  const targetChainId = useMemo(() => {
    return parseChainId(import.meta.env.VITE_TARGET_CHAIN_ID);
  }, []);

  const isSupportedNetwork = useMemo(() => {
    if (!targetChainId || chainId === null || chainId === undefined) return true;
    const numericCurrentChainId = parseChainId(chainId);
    return numericCurrentChainId === targetChainId;
  }, [chainId, targetChainId]);

  // Load roles from RoleManager contract
  const refreshRoles = useCallback(async () => {
    if (!isConnected || !address) {
      setRolesState({
        isCitizen: false,
        isOfficer: false,
        isDeptAdmin: false,
        isSuperAdmin: false,
        activeRoles: [],
        highestRole: null,
        isRegistered: false,
        registeredAt: null,
        superAdminCount: 0,
      });
      setCurrentRole(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // If connected to an unsupported network, do not attempt to query contracts
    if (!isSupportedNetwork) {
      setRolesState({
        isCitizen: false,
        isOfficer: false,
        isDeptAdmin: false,
        isSuperAdmin: false,
        activeRoles: [],
        highestRole: null,
        isRegistered: false,
        registeredAt: null,
        superAdminCount: 0,
      });
      setCurrentRole(null);
      setIsLoading(false);
      return;
    }

    if (!isConfigured) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const runner = signer || provider;
      const data = await fetchUserRoles(runner, address);

      if (import.meta.env.DEV) {
        console.log('[RoleContext] Queried RoleManager for', address, ':', {
          activeRoles: data.activeRoles,
          isRegistered: data.isRegistered,
          highestRole: data.highestRole,
        });
      }

      setRolesState(data);

      // Default the selected view to the highest applicable role, or null if no roles
      setCurrentRole((prev) => {
        if (prev && data.activeRoles.includes(prev)) {
          return prev;
        }
        return data.highestRole;
      });
    } catch (err) {
      console.error('Error fetching user roles:', err);
      setError('Could not verify on-chain permissions. Please verify network connection.');
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address, isConfigured, isSupportedNetwork, signer, provider]);

  // Auto-refresh when wallet, address, chain, or contract configuration changes
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (active) {
        await refreshRoles();
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [refreshRoles]);


  // Citizen self-registration handler
  const handleRegisterCitizen = useCallback(async () => {
    if (!signer) {
      throw new Error('Wallet not connected with signer privileges.');
    }

    setIsLoading(true);
    try {
      const receipt = await registerCitizen(signer);
      await refreshRoles();
      return receipt;
    } catch (err) {
      console.error('Citizen registration error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [signer, refreshRoles]);

  const value = useMemo(
    () => ({
      ...rolesState,
      currentRole,
      setCurrentRole,
      isLoading,
      error,
      refreshRoles,
      registerCitizen: handleRegisterCitizen,
      hasRole: (role) => rolesState.activeRoles.includes(role),
      isSupportedNetwork,
      targetChainId,
      ROLES,
      ROLE_HIERARCHY,
      ROLE_METADATA,
    }),
    [
      rolesState,
      currentRole,
      isLoading,
      error,
      refreshRoles,
      handleRegisterCitizen,
      isSupportedNetwork,
      targetChainId,
    ]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}
