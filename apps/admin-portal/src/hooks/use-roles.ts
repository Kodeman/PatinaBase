/**
 * React Query hooks for Roles & Permissions management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesService } from '@/services/roles';
import type {
  Role,
  Permission,
  GroupedPermissionsResponse,
  RoleUser,
  BulkOperationResult,
  CreateRoleRequest,
  UpdateRoleRequest,
  CloneRoleRequest,
} from '@/services/roles';
import type { PaginatedResponse } from '@/types';

// =============================================================================
// Query Keys
// =============================================================================

export const roleKeys = {
  all: ['roles'] as const,
  lists: () => [...roleKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...roleKeys.lists(), filters] as const,
  details: () => [...roleKeys.all, 'detail'] as const,
  detail: (id: string) => [...roleKeys.details(), id] as const,
  users: (roleId: string) => [...roleKeys.all, 'users', roleId] as const,
  usersPage: (roleId: string, page: number, pageSize: number) =>
    [...roleKeys.users(roleId), { page, pageSize }] as const,
};

export const permissionKeys = {
  all: ['permissions'] as const,
  list: () => [...permissionKeys.all, 'list'] as const,
  grouped: () => [...permissionKeys.all, 'grouped'] as const,
};

// =============================================================================
// Role Queries
// =============================================================================

/**
 * Fetch all roles with user and permission counts
 */
export function useRoles() {
  return useQuery({
    queryKey: roleKeys.lists(),
    queryFn: async () => {
      const response = await rolesService.getRoles();
      return response.data;
    },
  });
}

/**
 * Fetch a single role by ID
 */
export function useRole(roleId: string) {
  return useQuery({
    queryKey: roleKeys.detail(roleId),
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
export function useRoleUsers(roleId: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: roleKeys.usersPage(roleId, page, pageSize),
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
export function usePermissions() {
  return useQuery({
    queryKey: permissionKeys.list(),
    queryFn: async () => {
      const response = await rolesService.getPermissions();
      return response.data;
    },
  });
}

/**
 * Fetch all permissions grouped by domain
 */
export function usePermissionsGrouped() {
  return useQuery({
    queryKey: permissionKeys.grouped(),
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
export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRoleRequest) => {
      const response = await rolesService.createRole(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

/**
 * Update an existing role
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, data }: { roleId: string; data: UpdateRoleRequest }) => {
      const response = await rolesService.updateRole(roleId, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

/**
 * Delete a role
 */
export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, force = false }: { roleId: string; force?: boolean }) => {
      const response = await rolesService.deleteRole(roleId, force);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

/**
 * Clone an existing role
 */
export function useCloneRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sourceRoleId, data }: { sourceRoleId: string; data: CloneRoleRequest }) => {
      const response = await rolesService.cloneRole(sourceRoleId, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

// =============================================================================
// Permission Mutations
// =============================================================================

/**
 * Replace all permissions on a role
 */
export function useReplacePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) => {
      const response = await rolesService.replacePermissions(roleId, permissionIds);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

/**
 * Add permissions to a role
 */
export function useAddPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) => {
      const response = await rolesService.addPermissions(roleId, permissionIds);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

/**
 * Remove permissions from a role
 */
export function useRemovePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) => {
      const response = await rolesService.removePermissions(roleId, permissionIds);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

// =============================================================================
// User Assignment Mutations
// =============================================================================

/**
 * Bulk assign a role to multiple users
 */
export function useBulkAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, userIds }: { roleId: string; userIds: string[] }) => {
      const response = await rolesService.bulkAssignRole(roleId, userIds);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.users(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

/**
 * Bulk remove a role from multiple users
 */
export function useBulkRemoveRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, userIds }: { roleId: string; userIds: string[] }) => {
      const response = await rolesService.bulkRemoveRole(roleId, userIds);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.users(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

/**
 * Assign a single role to a user
 */
export function useAssignRoleToUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      await rolesService.assignRoleToUser(userId, roleId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.users(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
      // Also invalidate user queries
      queryClient.invalidateQueries({ queryKey: ['users', 'detail', variables.userId] });
    },
  });
}

/**
 * Remove a single role from a user
 */
export function useRemoveRoleFromUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      await rolesService.removeRoleFromUser(userId, roleId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.users(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
      // Also invalidate user queries
      queryClient.invalidateQueries({ queryKey: ['users', 'detail', variables.userId] });
    },
  });
}
