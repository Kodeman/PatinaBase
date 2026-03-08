'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-auth';
import { Permission, Role } from '@/lib/rbac';

interface ProtectedComponentProps {
  children: ReactNode;
  permission?: Permission;
  role?: Role;
  anyPermissions?: Permission[];
  allPermissions?: Permission[];
  fallback?: ReactNode;
  hideIfNoAccess?: boolean;
}

/**
 * Component wrapper that renders children only if user has required permissions
 */
export function ProtectedComponent({
  children,
  permission,
  role,
  anyPermissions,
  allPermissions,
  fallback,
  hideIfNoAccess = false,
}: ProtectedComponentProps) {
  const { checkPermission, checkRole, checkAnyPermission, checkAllPermissions } =
    usePermissions();

  let hasAccess = true;

  // Check single permission
  if (permission && !checkPermission(permission)) {
    hasAccess = false;
  }

  // Check role
  if (role && !checkRole(role)) {
    hasAccess = false;
  }

  // Check any of the permissions
  if (anyPermissions && !checkAnyPermission(anyPermissions)) {
    hasAccess = false;
  }

  // Check all permissions
  if (allPermissions && !checkAllPermissions(allPermissions)) {
    hasAccess = false;
  }

  if (!hasAccess) {
    if (hideIfNoAccess) {
      return null;
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Higher-order component to protect components with permission checks
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  permission: Permission,
  fallback?: ReactNode
) {
  return function ProtectedComponentWrapper(props: P) {
    return (
      <ProtectedComponent permission={permission} fallback={fallback}>
        <Component {...props} />
      </ProtectedComponent>
    );
  };
}

/**
 * Higher-order component to protect components with role checks
 */
export function withRole<P extends object>(
  Component: React.ComponentType<P>,
  role: Role,
  fallback?: ReactNode
) {
  return function ProtectedComponentWrapper(props: P) {
    return (
      <ProtectedComponent role={role} fallback={fallback}>
        <Component {...props} />
      </ProtectedComponent>
    );
  };
}
