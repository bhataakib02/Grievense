import React from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { RoleNavigation } from '../components/navigation/RoleNavigation';
import { useRouter } from '../hooks/useRouter';
import { useRoles } from '../hooks/useRoles';

export function MainLayout({ children }) {
  const { currentRoute } = useRouter();
  const { isConnected, activeRoles } = useRoles();

  const isDashboardRoute = currentRoute !== '/' && !currentRoute.startsWith('/unauthorized');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header />
      {isConnected && activeRoles.length > 0 && isDashboardRoute && <RoleNavigation />}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {children}
      </main>
      <Footer />
    </div>
  );
}
