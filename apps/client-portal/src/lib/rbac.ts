import {
  PermissionCode,
  PermissionString,
  LegacyPermissionAlias,
  resolvePermission,
  hasPermissionUnified,
  hasAllPermissionsUnified,
  hasAnyPermissionUnified,
  getPermissionsForRole,
  RoleName,
  type AnyPermission,
} from '@patina/types';

// Re-export types from @patina/types for convenience
export { PermissionCode, RoleName, type AnyPermission, type PermissionString };

/**
 * Session shape used by RBAC functions.
 * Compatible with both the Supabase auth session and legacy NextAuth shape.
 */
export interface Session {
  user: {
    id: string;
    email: string;
    name?: string | null;
    roles?: string[];
    permissions?: string[];
  };
  accessToken?: string;
  expires?: string;
}

/**
 * Role enum for frontend use
 * Maps to backend RoleName for compatibility
 */
export enum Role {
  DESIGNER = 'designer',
  ADMIN = 'admin',
  CLIENT = 'client',
  MANUFACTURER = 'manufacturer',
  SUPPORT = 'support',
  STUDIO_MANAGER = 'studio_manager',
}

/**
 * Legacy Permission enum - DEPRECATED
 * Use PermissionCode from @patina/types instead
 *
 * These map to canonical backend codes via LegacyPermissionAlias
 *
 * @deprecated Use PermissionCode from @patina/types
 */
export enum Permission {
  // Project viewing
  VIEW_PROJECT = 'view:project',
  VIEW_PROPOSAL = 'view:proposal',

  // Client-specific
  VIEW_CLIENT = 'view:client',
}

/**
 * Role-permission mapping for fallback when JWT doesn't have permissions
 * @deprecated Prefer JWT-based permissions
 */
const rolePermissions: Record<Role, Permission[]> = {
  [Role.CLIENT]: [Permission.VIEW_PROPOSAL, Permission.VIEW_PROJECT],
  [Role.DESIGNER]: [Permission.VIEW_PROPOSAL, Permission.VIEW_PROJECT, Permission.VIEW_CLIENT],
  [Role.ADMIN]: Object.values(Permission),
  [Role.MANUFACTURER]: [],
  [Role.SUPPORT]: [Permission.VIEW_CLIENT],
  [Role.STUDIO_MANAGER]: Object.values(Permission),
};

/**
 * Check if user has a permission.
 *
 * Uses JWT permissions if available, falls back to role-based derivation.
 * Accepts both legacy codes (view:project) and canonical codes (project.view).
 *
 * @param session - Auth session
 * @param permission - Permission to check (legacy or canonical)
 * @returns true if user has the permission
 */
export function hasPermission(
  session: Session | null,
  permission: Permission | AnyPermission
): boolean {
  if (!session?.user) return false;

  // Prefer JWT permissions if available
  const userPermissions = session.user.permissions;
  if (userPermissions && userPermissions.length > 0) {
    return hasPermissionUnified(userPermissions, permission as AnyPermission);
  }

  // Fallback: derive from roles (backward compatibility)
  return derivePermissionFromRoles(session.user.roles, permission);
}

/**
 * Derive permission from roles (fallback when no JWT permissions)
 */
function derivePermissionFromRoles(
  roles: string[] | undefined,
  permission: Permission | AnyPermission
): boolean {
  if (!roles) return false;

  // First check if it's a legacy permission
  if (Object.values(Permission).includes(permission as Permission)) {
    return roles.some((role) =>
      rolePermissions[role as Role]?.includes(permission as Permission)
    );
  }

  // For canonical permissions, check if user's roles include them
  const canonical = resolvePermission(permission as AnyPermission);
  return roles.some((role) => {
    const roleName = role as RoleName;
    const rolePerms = getPermissionsForRole(roleName);
    return rolePerms?.includes(canonical as PermissionString);
  });
}

/**
 * Check if user has a specific role
 */
export function hasRole(session: Session | null, role: Role | string): boolean {
  if (!session?.user?.roles) return false;
  return session.user.roles.includes(role);
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(
  session: Session | null,
  roles: (Role | string)[]
): boolean {
  if (!session?.user?.roles) return false;
  return roles.some((role) => session.user.roles!.includes(role));
}

/**
 * Get user's primary role (highest priority role)
 */
export function getPrimaryRole(session: Session | null): Role | null {
  if (!session?.user?.roles || session.user.roles.length === 0) return null;

  // Priority: ADMIN > STUDIO_MANAGER > DESIGNER > SUPPORT > CLIENT > MANUFACTURER
  if (session.user.roles.includes(Role.ADMIN)) return Role.ADMIN;
  if (session.user.roles.includes(Role.STUDIO_MANAGER)) return Role.STUDIO_MANAGER;
  if (session.user.roles.includes(Role.DESIGNER)) return Role.DESIGNER;
  if (session.user.roles.includes(Role.SUPPORT)) return Role.SUPPORT;
  if (session.user.roles.includes(Role.CLIENT)) return Role.CLIENT;
  if (session.user.roles.includes(Role.MANUFACTURER)) return Role.MANUFACTURER;

  return session.user.roles[0] as Role;
}

/**
 * Check if user is a client
 */
export function isClient(session: Session | null): boolean {
  return hasRole(session, Role.CLIENT);
}

/**
 * Check if user is admin
 */
export function isAdmin(session: Session | null): boolean {
  return hasRole(session, Role.ADMIN);
}
