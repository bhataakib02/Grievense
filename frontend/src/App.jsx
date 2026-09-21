import React from 'react';
import { WalletProvider } from './context/WalletContext';
import { RoleProvider } from './context/RoleContext';
import { RouterProvider } from './context/RouterContext';
import { useRouter } from './hooks/useRouter';
import { MainLayout } from './layouts/MainLayout';
import { LandingPage } from './pages/LandingPage';
import { CitizenDashboard } from './pages/CitizenDashboard';
import { CreateGrievance } from './pages/CreateGrievance';
import { GrievanceDetails } from './pages/GrievanceDetails';
import { OfficerDashboard } from './pages/OfficerDashboard';
import { DepartmentAdminDashboard } from './pages/DepartmentAdminDashboard';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { PublicVerification } from './pages/PublicVerification';
import { BlockchainDebugPage } from './pages/BlockchainDebugPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { ProtectedRoute } from './components/navigation/ProtectedRoute';
import { ROLES } from './services/roleService';

function AppRoutes() {
  const { currentRoute } = useRouter();

  // Public verification route (no wallet required)
  if (currentRoute === '/verify' || currentRoute.startsWith('/verify/')) {
    const initialId = currentRoute.startsWith('/verify/')
      ? currentRoute.replace('/verify/', '').trim()
      : '';
    return <PublicVerification initialGrievanceId={initialId} />;
  }

  // Blockchain diagnostic route
  if (currentRoute === '/debug/blockchain') {
    return <BlockchainDebugPage />;
  }

  // Citizen grievance creation
  if (currentRoute === '/citizen/submit') {
    return (
      <ProtectedRoute allowedRoles={[ROLES.CITIZEN]}>
        <CreateGrievance />
      </ProtectedRoute>
    );
  }

  // Unified or role-specific grievance detail views
  if (
    currentRoute.startsWith('/grievance/') ||
    currentRoute.startsWith('/citizen/grievance/') ||
    currentRoute.startsWith('/officer/grievance/') ||
    currentRoute.startsWith('/dept-admin/grievance/') ||
    currentRoute.startsWith('/super-admin/grievance/')
  ) {
    let grievanceId = '';
    if (currentRoute.startsWith('/citizen/grievance/')) {
      grievanceId = currentRoute.replace('/citizen/grievance/', '').trim();
    } else if (currentRoute.startsWith('/officer/grievance/')) {
      grievanceId = currentRoute.replace('/officer/grievance/', '').trim();
    } else if (currentRoute.startsWith('/dept-admin/grievance/')) {
      grievanceId = currentRoute.replace('/dept-admin/grievance/', '').trim();
    } else if (currentRoute.startsWith('/super-admin/grievance/')) {
      grievanceId = currentRoute.replace('/super-admin/grievance/', '').trim();
    } else {
      grievanceId = currentRoute.replace('/grievance/', '').trim();
    }

    return (
      <ProtectedRoute
        allowedRoles={[
          ROLES.CITIZEN,
          ROLES.OFFICER,
          ROLES.DEPARTMENT_ADMIN,
          ROLES.SUPER_ADMIN,
        ]}
      >
        <GrievanceDetails grievanceId={grievanceId} />
      </ProtectedRoute>
    );
  }

  // Role dashboards
  switch (currentRoute) {
    case '/citizen':
      return (
        <ProtectedRoute allowedRoles={[ROLES.CITIZEN]}>
          <CitizenDashboard />
        </ProtectedRoute>
      );

    case '/officer':
      return (
        <ProtectedRoute allowedRoles={[ROLES.OFFICER]}>
          <OfficerDashboard />
        </ProtectedRoute>
      );

    case '/dept-admin':
    case '/department-admin':
      return (
        <ProtectedRoute allowedRoles={[ROLES.DEPARTMENT_ADMIN, ROLES.SUPER_ADMIN]}>
          <DepartmentAdminDashboard />
        </ProtectedRoute>
      );

    case '/super-admin':
    case '/admin':
      return (
        <ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN]}>
          <SuperAdminDashboard />
        </ProtectedRoute>
      );

    case '/unauthorized':
      return <UnauthorizedPage />;

    case '/':
    default:
      return <LandingPage />;
  }
}

export function App() {
  return (
    <WalletProvider>
      <RoleProvider>
        <RouterProvider>
          <MainLayout>
            <AppRoutes />
          </MainLayout>
        </RouterProvider>
      </RoleProvider>
    </WalletProvider>
  );
}

export default App;
