import { useContext } from 'react';
import { RouterContext } from '../context/RouterContextDefinition';

/**
 * Hook to access current route path and navigation function.
 */
export function useRouter() {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}
