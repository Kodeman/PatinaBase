/**
 * React Query hooks for Roles & Permissions management (Admin)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesService } from '@/services/admin/roles';
import type {
  Role,
  Permission,
  GroupedPermissionsResponse,
  RoleUser,
  BulkOperationResult,
  CreateRoleRequest,
  UpdateRoleRequest,
  CloneRoleRequest,
} from '@/services/admin/roles';
import type { PaginatedResponse } from '@/types';

// =============================================================================
// Query Keys
// =============================================================================

export const adminRoleKeys = {
  all: ['admin', 'roles'] as const,
  lists: () => [...adminRoleKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...adminRoleKeys.lists(), filters] as const,
  details: () => [...adminRoleKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminRoleKeys.details(), id] as const,
  users: (roleId: string) => [...adminRoleKeys.all, 'users', roleId] as const,
  usersPage: (roleId: string, page: number, pageSize: number) =>
    [...adminRoleKeys.users(roleId), { page, pageSize }] as const,
};

export const adminPermissionKeys = {
  all: ['admin', 'permissions'] as const,
  list: () => [...adminPermissionKeys.all, 'list'] as const,
  grouped: () => [...adminPermissionKeys.all, 'grouped'] as const,
};

// =============================================================================
// Role Queries
// =============================================================================

/**
 * Fetch all roles with user and permission counts
 */
export function useAdminRoles() {
  return useQuery({
    queryKey: adminRoleKeys.lists(),
    queryFn: async () => {
      const response = await rolesService.getRoles();
      return response.data;
    },
  });
}

/**
 * Fetch a single role by ID
 */
export function useAdminRole(roleId: string) {
  return useQuery({
    queryKey: adminRoleKeys.detail(roleId),
    queryFn: async () => {
      const response = await rolesService.getRole(roleId);
      return response.data;
    },
    enabled: !!roleId,
  });
}

/**
 * Fetch users assigned to a role with pagination
 */
export function useAdminRoleUsers(roleId: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: adminRoleKeys.usersPage(roleId, page, pageSize),
    queryFn: async () => {
      const response = await rolesService.getUsersForRole(roleId, { page, pageSize });
      return response.data as PaginatedResponse<RoleUser>;
    },
    enabled: !!roleId,
  });
}

// =============================================================================
// Permission Queries
// =============================================================================

/**
 * Fetch all permissions (flat list)
 */
export function useAdminPermissions() {
  return useQuery({
    queryKey: adminPermissionKeys.list(),
    queryFn: async () => {
      const response = await rolesService.getPermissions();
      return response.data;
    },
  });
}

/**
 * Fetch all permissions grouped by domain
 */
export function useAdminPermissionsGrouped() {
  return useQuery({
    queryKey: adminPermissionKeys.grouped(),
    queryFn: async () => {
      const response = await rolesService.getPermissionsGrouped();
      return response.data;
    },
  });
}

// =============================================================================
// Role Mutations
// =============================================================================

/**
 * Create a new custom role
 */
export function useCreateAdminRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRoleRequest) => {
      const response = await rolesService.createRole(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
    },
  });
}

/**
 * Update an existing role
 */
export function useUpdateAdminRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, data }: { roleId: string; data: UpdateRoleRequest }) => {
      const response = await rolesService.updateRole(roleId, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
    },
  });
}

/**
 * Delete a role
 */
export function useDeleteAdminRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, force = false }: { roleId: string; force?: boolean }) => {
      const response = await rolesService.deleteRole(roleId, force);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
    },
  });
}

/**
 * Clone an existing role
 */
export function useCloneAdminRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sourceRoleId, data }: { sourceRoleId: string; data: CloneRoleRequest }) => {
      const response = await rolesService.cloneRole(sourceRoleId, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
    },
  });
}

// =============================================================================
// Permission Mutations
// =============================================================================

/**
 * Replace all permissions on a role
 */
export function useReplaceAdminPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) => {
      const response = await rolesService.replacePermissions(roleId, permissionIds);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
    },
  });
}

/**
 * Add permissions to a role
 */
export function useAddAdminPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) => {
      const response = await rolesService.addPermissions(roleId, permissionIds);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
    },
  });
}

/**
 * Remove permissions from a role
 */
export function useRemoveAdminPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) => {
      const response = await rolesService.removePermissions(roleId, permissionIds);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
    },
  });
}

// =============================================================================
// User Assignment Mutations
// =============================================================================

/**
 * Bulk assign a role to multiple users
 */
export function useBulkAssignAdminRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, userIds }: { roleId: string; userIds: string[] }) => {
      const response = await rolesService.bulkAssignRole(roleId, userIds);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.users(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
    },
  });
}

/**
 * Bulk remove a role from multiple users
 */
export function useBulkRemoveAdminRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, userIds }: { roleId: string; userIds: string[] }) => {
      const response = await rolesService.bulkRemoveRole(roleId, userIds);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.users(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
    },
  });
}

/**
 * Assign a single role to a user
 */
export function useAssignAdminRoleToUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      await rolesService.assignRoleToUser(userId, roleId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.users(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
      // Also invalidate user queries
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'detail', variables.userId] });
    },
  });
}

/**
 * Remove a single role from a user
 */
export function useRemoveAdminRoleFromUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      await rolesService.removeRoleFromUser(userId, roleId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.users(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
      // Also invalidate user queries
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'detail', variables.userId] });
    },
  });
}
