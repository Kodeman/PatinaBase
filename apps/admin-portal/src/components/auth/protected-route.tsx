'use client';

import { useAuth, usePermissions } from '@/hooks/use-auth';
import { ProtectedRoute as BaseProtectedRoute, type ProtectedRouteProps as BaseProps } from '@patina/design-system';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  requiredRoles?: string[];
  requireAllRoles?: boolean;
}

/**
 * Protected route component for Admin Portal
 * Wraps the design system component with app-specific auth
 */
export function ProtectedRoute({
  children,
  requiredRole,
  requiredRoles = [],
  requireAllRoles = false,
}: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();
  const { hasRole } = usePermissions();
  const hasAnyRole = (roles: string[]) => roles.some(r => hasRole(r as any));
  const hasAllRoles = (roles: string[]) => roles.every(r => hasRole(r as any));

  return (
    <BaseProtectedRoute
      isAuthenticated={isAuthenticated}
      userRoles={user?.roles}
      requiredRole={requiredRole}
      requiredRoles={requiredRoles}
      requireAllRoles={requireAllRoles}
      roleValidator={(userRoles, required) =>
        requireAllRoles
          ? hasAllRoles(required)
          : hasAnyRole(required)
      }
      returnUrl="/users"
      returnLabel="Return to User Management"
    >
      {children}
    </BaseProtectedRoute>
  );
}
