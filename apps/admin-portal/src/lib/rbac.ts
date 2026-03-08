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
 * Compatible with the Supabase auth session shape from useAuth().
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
  // Client management
  CREATE_CLIENT = 'create:client',
  VIEW_CLIENT = 'view:client',
  UPDATE_CLIENT = 'update:client',
  DELETE_CLIENT = 'delete:client',

  // Proposals
  CREATE_PROPOSAL = 'create:proposal',
  VIEW_PROPOSAL = 'view:proposal',
  UPDATE_PROPOSAL = 'update:proposal',
  DELETE_PROPOSAL = 'delete:proposal',
  SEND_PROPOSAL = 'send:proposal',

  // Projects
  CREATE_PROJECT = 'create:project',
  VIEW_PROJECT = 'view:project',
  UPDATE_PROJECT = 'update:project',

  // Teaching
  SUBMIT_TEACHING = 'submit:teaching',
  MANAGE_RULES = 'manage:rules',

  // Admin
  MANAGE_USERS = 'manage:users',
  VIEW_ANALYTICS = 'view:analytics',
}

/**
 * Role-permission mapping for fallback when JWT doesn't have permissions
 * @deprecated Prefer JWT-based permissions
 */
const rolePermissions: Record<Role, Permission[]> = {
  [Role.DESIGNER]: [
    Permission.CREATE_CLIENT,
    Permission.VIEW_CLIENT,
    Permission.UPDATE_CLIENT,
    Permission.CREATE_PROPOSAL,
    Permission.VIEW_PROPOSAL,
    Permission.UPDATE_PROPOSAL,
    Permission.DELETE_PROPOSAL,
    Permission.SEND_PROPOSAL,
    Permission.CREATE_PROJECT,
    Permission.VIEW_PROJECT,
    Permission.UPDATE_PROJECT,
    Permission.SUBMIT_TEACHING,
    Permission.MANAGE_RULES,
  ],
  [Role.ADMIN]: Object.values(Permission),
  [Role.CLIENT]: [Permission.VIEW_PROPOSAL, Permission.VIEW_PROJECT],
  [Role.MANUFACTURER]: [],
  [Role.SUPPORT]: [Permission.VIEW_CLIENT, Permission.MANAGE_USERS],
  [Role.STUDIO_MANAGER]: [
    Permission.CREATE_CLIENT,
    Permission.VIEW_CLIENT,
    Permission.UPDATE_CLIENT,
    Permission.CREATE_PROPOSAL,
    Permission.VIEW_PROPOSAL,
    Permission.UPDATE_PROPOSAL,
    Permission.DELETE_PROPOSAL,
    Permission.SEND_PROPOSAL,
    Permission.CREATE_PROJECT,
    Permission.VIEW_PROJECT,
    Permission.UPDATE_PROJECT,
    Permission.SUBMIT_TEACHING,
    Permission.MANAGE_RULES,
    Permission.MANAGE_USERS,
  ],
};

/**
 * Check if user has a permission.
 *
 * Uses JWT permissions if available, falls back to role-based derivation.
 * Accepts both legacy codes (create:client) and canonical codes (identity.user.create).
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
  // Use the type-safe ROLE_PERMISSIONS from @patina/types
  const canonical = resolvePermission(permission as AnyPermission);
  return roles.some((role) => {
    const roleName = role as RoleName;
    const rolePerms = getPermissionsForRole(roleName);
    return rolePerms?.includes(canonical as PermissionString);
  });
}

/**
 * Require a permission or throw
 *
 * @deprecated Use hasPermission and handle the error yourself
 */
export function requirePermission(
  session: Session | null,
  permission: Permission | AnyPermission
): void {
  if (!hasPermission(session, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
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
 * Check if user has all specified roles
 */
export function hasAllRoles(
  session: Session | null,
  roles: (Role | string)[]
): boolean {
  if (!session?.user?.roles) return false;
  return roles.every((role) => session.user.roles!.includes(role));
}

/**
 * Get all permissions for a user.
 *
 * Returns JWT permissions if available, otherwise derives from roles.
 */
export function getUserPermissions(session: Session | null): string[] {
  if (!session?.user) return [];

  // Prefer JWT permissions
  if (session.user.permissions && session.user.permissions.length > 0) {
    return session.user.permissions;
  }

  // Fallback: derive from roles
  const permissions = new Set<string>();

  session.user.roles?.forEach((role) => {
    // Add legacy permissions
    const rolePerms = rolePermissions[role as Role] || [];
    rolePerms.forEach((perm) => permissions.add(perm));

    // Also add canonical permissions
    const rolePermsCanonical = getPermissionsForRole(role as RoleName);
    if (rolePermsCanonical) {
      rolePermsCanonical.forEach((perm) => permissions.add(perm));
    }
  });

  return Array.from(permissions);
}

/**
 * Check if user can perform action on resource
 *
 * @deprecated Use hasPermission with specific permission codes
 */
export function canPerformAction(
  session: Session | null,
  action: 'create' | 'view' | 'update' | 'delete' | 'send' | 'manage' | 'submit',
  resource:
    | 'client'
    | 'proposal'
    | 'project'
    | 'teaching'
    | 'users'
    | 'analytics'
): boolean {
  const permissionMap: Record<string, Permission> = {
    'create:client': Permission.CREATE_CLIENT,
    'view:client': Permission.VIEW_CLIENT,
    'update:client': Permission.UPDATE_CLIENT,
    'delete:client': Permission.DELETE_CLIENT,
    'create:proposal': Permission.CREATE_PROPOSAL,
    'view:proposal': Permission.VIEW_PROPOSAL,
    'update:proposal': Permission.UPDATE_PROPOSAL,
    'delete:proposal': Permission.DELETE_PROPOSAL,
    'send:proposal': Permission.SEND_PROPOSAL,
    'create:project': Permission.CREATE_PROJECT,
    'view:project': Permission.VIEW_PROJECT,
    'update:project': Permission.UPDATE_PROJECT,
    'submit:teaching': Permission.SUBMIT_TEACHING,
    'manage:rules': Permission.MANAGE_RULES,
    'manage:users': Permission.MANAGE_USERS,
    'view:analytics': Permission.VIEW_ANALYTICS,
  };

  const key = `${action}:${resource}`;
  const permission = permissionMap[key];

  if (!permission) return false;

  return hasPermission(session, permission);
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
 * Check if user is admin
 */
export function isAdmin(session: Session | null): boolean {
  return hasRole(session, Role.ADMIN);
}

/**
 * Check if user is designer
 */
export function isDesigner(session: Session | null): boolean {
  return hasRole(session, Role.DESIGNER);
}

/**
 * Check if user is client
 */
export function isClient(session: Session | null): boolean {
  return hasRole(session, Role.CLIENT);
}

/**
 * Check if user is studio manager
 */
export function isStudioManager(session: Session | null): boolean {
  return hasRole(session, Role.STUDIO_MANAGER);
}

// =============================================================================
// NEW UNIFIED PERMISSION API
// =============================================================================
// These functions use the canonical permission codes from @patina/types

/**
 * Check if user has a canonical permission.
 *
 * This is the preferred API for new code.
 *
 * @example
 * ```typescript
 * import { hasCanonicalPermission, PermissionCode } from '@/lib/rbac';
 *
 * if (hasCanonicalPermission(session, PermissionCode.CATALOG_PRODUCT_CREATE)) {
 *   // User can create products
 * }
 * ```
 */
export function hasCanonicalPermission(
  session: Session | null,
  permission: PermissionCode | PermissionString
): boolean {
  if (!session?.user) return false;

  const userPermissions = session.user.permissions;
  if (userPermissions && userPermissions.length > 0) {
    return userPermissions.includes(permission);
  }

  // Fallback to role-based check
  if (!session.user.roles) return false;

  return session.user.roles.some((role) => {
    const rolePerms = getPermissionsForRole(role as RoleName);
    return rolePerms?.includes(permission as PermissionString);
  });
}

/**
 * Check if user has ALL specified canonical permissions
 */
export function hasAllCanonicalPermissions(
  session: Session | null,
  permissions: (PermissionCode | PermissionString)[]
): boolean {
  return permissions.every((perm) => hasCanonicalPermission(session, perm));
}

/**
 * Check if user has ANY of the specified canonical permissions
 */
export function hasAnyCanonicalPermission(
  session: Session | null,
  permissions: (PermissionCode | PermissionString)[]
): boolean {
  return permissions.some((perm) => hasCanonicalPermission(session, perm));
}
