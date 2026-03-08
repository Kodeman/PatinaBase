/**
 * ProtectedRoute Component
 *
 * A flexible route protection component that validates user roles
 * before rendering children.
 *
 * @example Basic usage with role validator hook:
 * ```tsx
 * const { hasRole, hasAnyRole, hasAllRoles } = useAuth();
 *
 * <ProtectedRoute
 *   isAuthenticated={isAuthenticated}
 *   requiredRole="admin"
 *   roleValidator={(roles, required) => roles.some(r => required.includes(r))}
 *   userRoles={user?.roles}
 * >
 *   <AdminDashboard />
 * </ProtectedRoute>
 * ```
 */

'use client';

import React, { ReactNode } from 'react';
import { Button } from '../Button';

export interface ProtectedRouteProps {
  children: ReactNode;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** User's roles array */
  userRoles?: string[];
  /** Single required role */
  requiredRole?: string;
  /** Multiple required roles */
  requiredRoles?: string[];
  /** Whether all roles are required (true) or any role (false) */
  requireAllRoles?: boolean;
  /** Custom role validation function */
  roleValidator?: (userRoles: string[], requiredRoles: string[]) => boolean;
  /** Custom access denied component */
  accessDeniedComponent?: ReactNode;
  /** URL to return to on access denied */
  returnUrl?: string;
  /** Return button label */
  returnLabel?: string;
  /** Callback when access is denied */
  onAccessDenied?: () => void;
}

export function ProtectedRoute({
  children,
  isAuthenticated,
  userRoles = [],
  requiredRole,
  requiredRoles = [],
  requireAllRoles = false,
  roleValidator,
  accessDeniedComponent,
  returnUrl = '/',
  returnLabel = 'Go Back',
  onAccessDenied,
}: ProtectedRouteProps) {
  if (!isAuthenticated) {
    return null;
  }

  // Combine single role with multiple roles
  const allRequiredRoles = requiredRole
    ? [requiredRole, ...requiredRoles]
    : requiredRoles;

  // If no roles required, allow access
  if (allRequiredRoles.length === 0) {
    return <>{children}</>;
  }

  // Use custom validator or default logic
  const hasAccess = roleValidator
    ? roleValidator(userRoles, allRequiredRoles)
    : requireAllRoles
      ? allRequiredRoles.every(role => userRoles.includes(role))
      : allRequiredRoles.some(role => userRoles.includes(role));

  if (!hasAccess) {
    onAccessDenied?.();

    if (accessDeniedComponent) {
      return <>{accessDeniedComponent}</>;
    }

    return (
      <DefaultAccessDenied returnUrl={returnUrl} returnLabel={returnLabel} />
    );
  }

  return <>{children}</>;
}

interface DefaultAccessDeniedProps {
  returnUrl: string;
  returnLabel: string;
}

function DefaultAccessDenied({ returnUrl, returnLabel }: DefaultAccessDeniedProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-2xl font-bold text-gray-900">Access Denied</h2>
        <p className="mt-2 text-sm text-gray-600">
          You don't have permission to access this resource.
        </p>
        <div className="mt-6">
          <a href={returnUrl}>
            <Button>{returnLabel}</Button>
          </a>
        </div>
      </div>
    </div>
  );
}

export default ProtectedRoute;
