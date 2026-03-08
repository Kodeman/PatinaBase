'use client';

import { useAuth } from '@/hooks/use-auth';
import { ProtectedRoute as BaseProtectedRoute, type ProtectedRouteProps as BaseProps } from '@patina/design-system';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  requiredRoles?: string[];
  requireAllRoles?: boolean;
}

/**
 * Protected route component for Designer Portal
 * Wraps the design system component with app-specific auth
 */
export function ProtectedRoute({
  children,
  requiredRole,
  requiredRoles = [],
  requireAllRoles = false,
}: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();
  const userRoles = user?.roles || [];

  return (
    <BaseProtectedRoute
      isAuthenticated={isAuthenticated}
      userRoles={userRoles}
      requiredRole={requiredRole}
      requiredRoles={requiredRoles}
      requireAllRoles={requireAllRoles}
      returnUrl="/projects"
      returnLabel="Return to Projects"
    >
      {children}
    </BaseProtectedRoute>
  );
}
