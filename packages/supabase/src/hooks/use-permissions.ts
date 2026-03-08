import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

// Lazy client getter
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type RoleDomain = 'consumer' | 'designer' | 'manufacturer' | 'admin';

export interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  domain: RoleDomain;
  is_system: boolean;
  is_assignable: boolean;
  parent_role_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  scope: string | null;
  description: string | null;
  created_at: string;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  granted_at: string;
  granted_by: string | null;
  role: Role;
}

export interface PermissionContext {
  organizationId?: string;
  resourceOwnerId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  permissions: Set<string>,
  required: string,
  context?: PermissionContext & { userId?: string }
): boolean {
  // Super admin check (wildcard permission)
  if (permissions.has('*')) return true;

  // Direct permission check
  if (permissions.has(required)) return true;

  // Scoped permission check for .org permissions
  if (context?.organizationId && required.includes('.org')) {
    const scopedPerm = `${required}:${context.organizationId}`;
    if (permissions.has(scopedPerm)) return true;
  }

  // Ownership check for .own permissions
  if (required.includes('.own') && context?.resourceOwnerId === context?.userId) {
    // User owns the resource, check for base .own permission
    const ownPermission = required.replace(/\.org$/, '.own').replace(/\.all$/, '.own');
    if (permissions.has(ownPermission)) return true;
  }

  return false;
}

/**
 * Check multiple permissions (returns true if user has ANY of them)
 */
export function hasAnyPermission(
  permissions: Set<string>,
  required: string[],
  context?: PermissionContext & { userId?: string }
): boolean {
  return required.some(perm => hasPermission(permissions, perm, context));
}

/**
 * Check multiple permissions (returns true if user has ALL of them)
 */
export function hasAllPermissions(
  permissions: Set<string>,
  required: string[],
  context?: PermissionContext & { userId?: string }
): boolean {
  return required.every(perm => hasPermission(permissions, perm, context));
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the current user's assigned roles
 */
export function useUserRoles() {
  return useQuery({
    queryKey: ['user-roles'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          *,
          role:roles (*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      return data.map(ur => ({
        ...ur,
        role: ur.role,
      })) as UserRoleAssignment[];
    },
  });
}

/**
 * Get the current user's resolved permissions
 * Combines permissions from:
 * - Direct role assignments
 * - Organization membership roles
 * - Permission overrides
 */
export function useUserPermissions() {
  return useQuery({
    queryKey: ['user-permissions'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's direct roles
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', user.id);

      if (rolesError) throw rolesError;

      const roleIds = userRoles.map(ur => ur.role_id);

      // Get permissions for those roles
      const { data: rolePermissions, error: permError } = await supabase
        .from('role_permissions')
        .select(`
          permission:permissions (name)
        `)
        .in('role_id', roleIds);

      if (permError) throw permError;

      // Get organization membership overrides
      const { data: memberships, error: memError } = await supabase
        .from('organization_members')
        .select('organization_id, role, permissions_override')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (memError) throw memError;

      // Build permission set
      const permissions = new Set<string>();

      // Add permissions from direct roles
      rolePermissions.forEach(rp => {
        const permName = (rp.permission as { name: string } | null)?.name;
        if (permName) {
          permissions.add(permName);
        }
      });

      // Apply organization permission overrides
      memberships.forEach(m => {
        if (m.permissions_override) {
          const override = m.permissions_override as { grant?: string[]; revoke?: string[] };
          override.grant?.forEach(p => permissions.add(p));
          override.revoke?.forEach(p => permissions.delete(p));
        }
      });

      return {
        permissions: Array.from(permissions),
        permissionSet: permissions,
        organizationMemberships: memberships.map(m => ({
          organizationId: m.organization_id,
          role: m.role,
        })),
      };
    },
  });
}

/**
 * Check if the current user has a specific permission
 */
export function useHasPermission(
  permission: string,
  context?: PermissionContext
) {
  const { data: permData, isLoading: permLoading } = useUserPermissions();
  const { data: userData } = useQuery({
    queryKey: ['current-user-id'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id;
    },
  });

  if (permLoading || !permData) {
    return { hasPermission: false, isLoading: true };
  }

  const result = hasPermission(permData.permissionSet, permission, {
    ...context,
    userId: userData,
  });

  return { hasPermission: result, isLoading: false };
}

/**
 * Check if current user has any of the specified permissions
 */
export function useHasAnyPermission(
  permissions: string[],
  context?: PermissionContext
) {
  const { data: permData, isLoading: permLoading } = useUserPermissions();
  const { data: userData } = useQuery({
    queryKey: ['current-user-id'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id;
    },
  });

  if (permLoading || !permData) {
    return { hasPermission: false, isLoading: true };
  }

  const result = hasAnyPermission(permData.permissionSet, permissions, {
    ...context,
    userId: userData,
  });

  return { hasPermission: result, isLoading: false };
}

/**
 * Get all available roles (for admin UI)
 */
export function useAllRoles() {
  return useQuery({
    queryKey: ['all-roles'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('is_assignable', true)
        .order('domain')
        .order('display_name');

      if (error) throw error;
      return data as Role[];
    },
  });
}

/**
 * Get all system roles (for reference)
 */
export function useSystemRoles() {
  return useQuery({
    queryKey: ['system-roles'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('is_system', true)
        .order('domain')
        .order('display_name');

      if (error) throw error;
      return data as Role[];
    },
  });
}

/**
 * Get all permissions (for admin UI)
 */
export function useAllPermissions() {
  return useQuery({
    queryKey: ['all-permissions'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('resource')
        .order('action');

      if (error) throw error;
      return data as Permission[];
    },
  });
}

/**
 * Get permissions for a specific role
 */
export function useRolePermissions(roleId: string) {
  return useQuery({
    queryKey: ['role-permissions', roleId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('role_permissions')
        .select(`
          permission:permissions (*)
        `)
        .eq('role_id', roleId);

      if (error) throw error;
      return data.map(rp => rp.permission) as Permission[];
    },
    enabled: !!roleId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE HOOKS FOR COMMON PERMISSION CHECKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user is a designer (any designer role)
 */
export function useIsDesigner() {
  const { data: roles, isLoading } = useUserRoles();

  if (isLoading || !roles) {
    return { isDesigner: false, isLoading: true };
  }

  const isDesigner = roles.some(r => r.role.domain === 'designer');
  return { isDesigner, isLoading: false };
}

/**
 * Check if user is a manufacturer (any manufacturer role)
 */
export function useIsManufacturer() {
  const { data: roles, isLoading } = useUserRoles();

  if (isLoading || !roles) {
    return { isManufacturer: false, isLoading: true };
  }

  const isManufacturer = roles.some(r => r.role.domain === 'manufacturer');
  return { isManufacturer, isLoading: false };
}

/**
 * Check if user is an admin (any admin role)
 */
export function useIsAdmin() {
  const { data: roles, isLoading } = useUserRoles();

  if (isLoading || !roles) {
    return { isAdmin: false, isLoading: true };
  }

  const isAdmin = roles.some(r => r.role.domain === 'admin');
  return { isAdmin, isLoading: false };
}

/**
 * Check if user is a super admin
 */
export function useIsSuperAdmin() {
  const { data: roles, isLoading } = useUserRoles();

  if (isLoading || !roles) {
    return { isSuperAdmin: false, isLoading: true };
  }

  const isSuperAdmin = roles.some(r => r.role.name === 'super_admin');
  return { isSuperAdmin, isLoading: false };
}
