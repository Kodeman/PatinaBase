import type { UserRoleName } from '@patina/types';
import type { RouteContext } from '../utils/request-context';
import { hasRole, hasAnyRole, hasAllRoles } from '../utils/request-context';
import { apiForbidden } from '../utils/response-wrapper';
import { logAuthzFailure } from '../utils/logger';
import type { RouteHandler } from './with-validation';

/**
 * Role matching strategy
 */
export type RoleStrategy = 'any' | 'all';

/**
 * Role check options
 */
export interface RoleOptions {
  /** Roles to check for */
  roles: UserRoleName | UserRoleName[];
  /** Strategy for multiple roles (default: 'any') */
  strategy?: RoleStrategy;
  /** Custom forbidden message */
  message?: string;
}

/**
 * Role-based access control middleware
 * Ensures user has required role(s) before allowing access
 *
 * @example
 * ```ts
 * // Require admin role
 * const handler = withRole({ roles: 'admin' })(async (request, context) => {
 *   return apiSuccess({ message: 'Admin only' });
 * });
 *
 * // Require any of multiple roles
 * const handler = withRole({ roles: ['admin', 'designer'] })(async (request, context) => {
 *   return apiSuccess({ message: 'Admin or designer' });
 * });
 *
 * // Require all roles
 * const handler = withRole({
 *   roles: ['admin', 'designer'],
 *   strategy: 'all'
 * })(async (request, context) => {
 *   return apiSuccess({ message: 'Must be both admin AND designer' });
 * });
 * ```
 */
export function withRole(options: RoleOptions) {
  const { roles, strategy = 'any', message } = options;

  // Normalize roles to array
  const roleArray = Array.isArray(roles) ? roles : [roles];

  return function roleMiddleware(next: RouteHandler): RouteHandler {
    return async (request: Request, context: RouteContext): Promise<Response> => {
      // Check if user is authenticated
      if (!context.user) {
        logAuthzFailure(context, roleArray, []);
        return apiForbidden(
          message || 'Authentication required to access this resource'
        );
      }

      // Check roles based on strategy
      const hasRequiredRoles =
        strategy === 'all'
          ? hasAllRoles(context, roleArray)
          : hasAnyRole(context, roleArray);

      if (!hasRequiredRoles) {
        logAuthzFailure(context, roleArray, context.user.roles);
        return apiForbidden(
          message ||
            `Insufficient permissions. Required role(s): ${roleArray.join(', ')}`
        );
      }

      return next(request, context);
    };
  };
}

/**
 * Helper to require a single role
 */
export function requireRole(role: UserRoleName, message?: string) {
  return withRole({ roles: role, message });
}

/**
 * Helper to require any of multiple roles
 */
export function requireAnyRole(roles: UserRoleName[], message?: string) {
  return withRole({ roles, strategy: 'any', message });
}

/**
 * Helper to require all roles
 */
export function requireAllRoles(roles: UserRoleName[], message?: string) {
  return withRole({ roles, strategy: 'all', message });
}

/**
 * Predefined role middleware for common roles
 */
export const roleMiddleware = {
  /** Require admin role */
  admin: requireRole('admin', 'Admin access required'),

  /** Require designer role */
  designer: requireRole('designer', 'Designer access required'),

  /** Require manufacturer role */
  manufacturer: requireRole('manufacturer', 'Manufacturer access required'),

  /** Require customer role */
  customer: requireRole('customer', 'Customer access required'),

  /** Require admin or designer */
  adminOrDesigner: requireAnyRole(['admin', 'designer'], 'Admin or designer access required'),

  /** Require admin or manufacturer */
  adminOrManufacturer: requireAnyRole(['admin', 'manufacturer'], 'Admin or manufacturer access required'),
};
