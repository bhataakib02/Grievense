import React, { useState } from 'react';
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

  const { navigate } = useRouter();
  const [activeTab, setActiveTab] = useState('overview');


  if (!activeRoles || activeRoles.length === 0 || !currentRole) {
    return null;
  }

  // Navigation tabs per role
  const roleNavItems = {
    CITIZEN: [
      { id: 'overview', label: 'Dashboard Overview', path: '/citizen' },
      { id: 'submit', label: 'Submit Grievance', path: '/citizen/submit' },
      { id: 'verify', label: 'Public Verification', path: '/verify' },
    ],
    OFFICER: [
      { id: 'overview', label: 'Officer Console', path: '/officer' },
      { id: 'verify', label: 'Verify On-Chain', path: '/verify' },
    ],
    DEPARTMENT_ADMIN: [
      { id: 'overview', label: 'Department Console', path: '/dept-admin' },
      { id: 'verify', label: 'Verify On-Chain', path: '/verify' },
    ],
    SUPER_ADMIN: [
      { id: 'overview', label: 'Super Admin Center', path: '/super-admin' },
      { id: 'verify', label: 'Verify On-Chain', path: '/verify' },
    ],
  };

  const navItems = roleNavItems[currentRole] || [];

  return (
    <div className="bg-white border-b border-slate-200 -mt-8 sm:-mt-12 mb-8 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Multi-role Switcher */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Console:
            </span>
            {activeRoles.length > 1 ? (
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                {activeRoles.map((role) => {
                  const isSelected = currentRole === role;
                  const meta = ROLE_METADATA[role];
                  return (
                    <button
                      key={role}
                      onClick={() => {
                        setCurrentRole(role);
                        navigate(meta.dashboardRoute.slice(1));
                      }}
                      type="button"
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        isSelected
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {meta?.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant={ROLE_METADATA[currentRole]?.badgeVariant}>
                  {ROLE_METADATA[currentRole]?.label}
                </Badge>
                <span className="text-xs text-slate-500 hidden sm:inline">
                  {ROLE_METADATA[currentRole]?.description}
                </span>
              </div>
            )}
          </div>

          {/* Quick Dashboard Action Links */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {navItems.map((item) => {
              const isSelected = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    navigate(item.path);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
