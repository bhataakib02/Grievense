import React from 'react';
import { useRoles } from '../../hooks/useRoles';
import { useRouter } from '../../hooks/useRouter';
import { Badge } from '../common/Badge';

export function RoleNavigation() {
  const {
    activeRoles,
    currentRole,
    setCurrentRole,
    ROLE_METADATA,
  } = useRoles();

  const { currentRoute, navigate } = useRouter();

  if (!activeRoles || activeRoles.length === 0 || !currentRole) {
    return null;
  }

  // Navigation tabs per role
  const roleNavItems = {
    CITIZEN: [
      { id: 'overview', label: 'My Grievances', path: '/citizen' },
      { id: 'submit', label: '+ Submit Grievance', path: '/citizen/submit' },
      { id: 'verify', label: 'Verify On-Chain', path: '/verify' },
    ],
    OFFICER: [
      { id: 'overview', label: 'Assigned Cases', path: '/officer' },
      { id: 'verify', label: 'Verify On-Chain', path: '/verify' },
    ],
    DEPARTMENT_ADMIN: [
      { id: 'overview', label: 'Department Console', path: '/dept-admin' },
      { id: 'verify', label: 'Verify On-Chain', path: '/verify' },
    ],
    SUPER_ADMIN: [
      { id: 'overview', label: 'Governance Center', path: '/super-admin' },
      { id: 'verify', label: 'Verify On-Chain', path: '/verify' },
      { id: 'diagnostics', label: 'Blockchain Diagnostics', path: '/debug/blockchain' },
    ],
  };

  const navItems = roleNavItems[currentRole] || [];

  return (
    <div className="bg-white border-b border-slate-200/90 mb-4 sm:mb-6 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
          {/* Multi-role Switcher */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
              Active Console:
            </span>
            {activeRoles.length > 1 ? (
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 sm:p-1 shrink-0">
                {activeRoles.map((role) => {
                  const isSelected = currentRole === role;
                  const meta = ROLE_METADATA[role];
                  return (
                    <button
                      key={role}
                      onClick={() => {
                        setCurrentRole(role);
                        const route = meta?.dashboardRoute || '/';
                        navigate(route.startsWith('/') ? route : `/${route}`);
                      }}
                      type="button"
                      className={`px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {meta?.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={ROLE_METADATA[currentRole]?.badgeVariant} dot className="text-[11px]">
                  {ROLE_METADATA[currentRole]?.label}
                </Badge>
                <span className="text-xs text-slate-500 hidden lg:inline">
                  {ROLE_METADATA[currentRole]?.description}
                </span>
              </div>
            )}
          </div>

          {/* Quick Dashboard Action Links */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            {navItems.map((item) => {
              const isSelected =
                currentRoute === item.path ||
                (item.path !== '/' && currentRoute.startsWith(item.path));
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/60'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
