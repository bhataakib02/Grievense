import { useContext } from 'react';
import { RoleContext } from '../context/RoleContextDefinition';

/**
 * Custom hook to access on-chain role state, multi-role views, and permissions.
 */
export function useRoles() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRoles must be used within a RoleProvider');
  }
  return context;
}
