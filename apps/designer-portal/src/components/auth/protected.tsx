'use client';

import { ReactNode } from 'react';
import { useAuth, usePermissions } from '@/hooks/use-auth';
import { Permission, Role } from '@/lib/rbac';

interface ProtectedProps {
  children: ReactNode;
  fallback?: ReactNode;

  // Permission-based access
  permission?: Permission;
  anyPermissions?: Permission[];
  allPermissions?: Permission[];

  // Role-based access
  role?: Role;
  anyRoles?: Role[];
  allRoles?: Role[];

  // Show fallback or hide completely
  hideWhenDenied?: boolean;
}

/**
 * ProtectedComponent - Conditionally render children based on permissions or roles
 *
 * @example
 * // Single permission
 * <Protected permission={Permission.CREATE_CLIENT}>
 *   <CreateClientButton />
 * </Protected>
 *
 * @example
 * // Any of multiple permissions
 * <Protected anyPermissions={[Permission.VIEW_CLIENT, Permission.UPDATE_CLIENT]}>
 *   <ClientDetails />
 * </Protected>
 *
 * @example
 * // Role-based
 * <Protected role={Role.ADMIN} fallback={<div>Admin only</div>}>
 *   <AdminPanel />
 * </Protected>
 */
export function Protected({
  children,
  fallback = null,
  permission,
  anyPermissions,
  allPermissions,
  role,
  anyRoles,
  allRoles,
  hideWhenDenied = false,
}: ProtectedProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const { checkPermission, checkRole, checkAnyPermission, checkAllPermissions } = usePermissions();

  // Still loading
  if (isLoading) {
    return null;
  }

  // Not authenticated
  if (!isAuthenticated) {
    return hideWhenDenied ? null : <>{fallback}</>;
  }

  // Check single permission
  if (permission && !checkPermission(permission)) {
    return hideWhenDenied ? null : <>{fallback}</>;
  }

  // Check any permissions (OR logic)
  if (anyPermissions && !checkAnyPermission(anyPermissions)) {
    return hideWhenDenied ? null : <>{fallback}</>;
  }

  // Check all permissions (AND logic)
  if (allPermissions && !checkAllPermissions(allPermissions)) {
    return hideWhenDenied ? null : <>{fallback}</>;
  }

  // Check single role
  if (role && !checkRole(role)) {
    return hideWhenDenied ? null : <>{fallback}</>;
  }

  // Check any roles (OR logic)
  if (anyRoles && !anyRoles.some((r) => checkRole(r))) {
    return hideWhenDenied ? null : <>{fallback}</>;
  }

  // Check all roles (AND logic)
  if (allRoles && !allRoles.every((r) => checkRole(r))) {
    return hideWhenDenied ? null : <>{fallback}</>;
  }

  // All checks passed
  return <>{children}</>;
}

/**
 * Show content only when user has the permission (hides completely if denied)
 */
export function ShowIfPermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  return (
    <Protected permission={permission} hideWhenDenied>
      {children}
    </Protected>
  );
}

/**
 * Show content only when user has the role (hides completely if denied)
 */
export function ShowIfRole({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <Protected role={role} hideWhenDenied>
      {children}
    </Protected>
  );
}

/**
 * Show content only for admins
 */
export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <Protected role={Role.ADMIN} fallback={fallback} hideWhenDenied>
      {children}
    </Protected>
  );
}

/**
 * Show content only for designers
 */
export function DesignerOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <Protected role={Role.DESIGNER} fallback={fallback} hideWhenDenied>
      {children}
    </Protected>
  );
}

/**
 * Show content only for clients
 */
export function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <Protected role={Role.CLIENT} fallback={fallback} hideWhenDenied>
      {children}
    </Protected>
  );
}
