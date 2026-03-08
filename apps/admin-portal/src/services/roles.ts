/**
 * Roles & Permissions Service Layer
 * Handles all API interactions for role and permission management
 */

import { userManagementApi } from '@/lib/api-client';
import type { ApiResponse, PaginatedResponse } from '@/types';

const api = userManagementApi as any;

// =============================================================================
// Types
// =============================================================================

export interface Permission {
  id: string;
  code: string;
  resource: string;
  action: string;
  description?: string;
}

export interface PermissionGroup {
  domain: string;
  displayName: string;
  permissions: Permission[];
}

export interface GroupedPermissionsResponse {
  groups: PermissionGroup[];
  total: number;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  permissionCount: number;
  permissions?: Permission[];
}

export interface RoleUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  assignedAt: string;
  assignedBy?: string;
}

export interface BulkOperationResult {
  successCount: number;
  failedCount: number;
  failures: Record<string, string>;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissionIds?: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
}

export interface CloneRoleRequest {
  name: string;
  description?: string;
}

// =============================================================================
// Roles Service
// =============================================================================

export const rolesService = {
  // ==========================================================================
  // Role CRUD
  // ==========================================================================

  /**
   * Get all roles with user and permission counts
   */
  async getRoles(): Promise<ApiResponse<Role[]>> {
    return api.get('/v1/roles');
  },

  /**
   * Get a single role by ID
   */
  async getRole(roleId: string): Promise<ApiResponse<Role>> {
    return api.get(`/v1/roles/${roleId}`);
  },

  /**
   * Create a new custom role
   */
  async createRole(data: CreateRoleRequest): Promise<ApiResponse<Role>> {
    return api.post('/v1/roles', data);
  },

  /**
   * Update a role (custom roles only)
   */
  async updateRole(roleId: string, data: UpdateRoleRequest): Promise<ApiResponse<Role>> {
    return api.put(`/v1/roles/${roleId}`, data);
  },

  /**
   * Delete a role (custom roles only)
   */
  async deleteRole(roleId: string, force = false): Promise<ApiResponse<{ success: boolean; deletedRole: string; usersAffected: number }>> {
    return api.delete(`/v1/roles/${roleId}?force=${force}`);
  },

  /**
   * Clone an existing role (including system roles)
   */
  async cloneRole(sourceRoleId: string, data: CloneRoleRequest): Promise<ApiResponse<Role>> {
    return api.post(`/v1/roles/${sourceRoleId}/clone`, data);
  },

  // ==========================================================================
  // Permission Management
  // ==========================================================================

  /**
   * Get all permissions (flat list)
   */
  async getPermissions(): Promise<ApiResponse<Permission[]>> {
    return api.get('/v1/permissions');
  },

  /**
   * Get all permissions grouped by domain
   */
  async getPermissionsGrouped(): Promise<ApiResponse<GroupedPermissionsResponse>> {
    return api.get('/v1/permissions/grouped');
  },

  /**
   * Replace all permissions on a role
   */
  async replacePermissions(roleId: string, permissionIds: string[]): Promise<ApiResponse<Role>> {
    return api.put(`/v1/roles/${roleId}/permissions`, { permissionIds });
  },

  /**
   * Add permissions to a role
   */
  async addPermissions(roleId: string, permissionIds: string[]): Promise<ApiResponse<Role>> {
    return api.post(`/v1/roles/${roleId}/permissions`, { permissionIds });
  },

  /**
   * Remove permissions from a role
   */
  async removePermissions(roleId: string, permissionIds: string[]): Promise<ApiResponse<Role>> {
    return api.delete(`/v1/roles/${roleId}/permissions`, {
      body: JSON.stringify({ permissionIds }),
    });
  },

  // ==========================================================================
  // User Assignment
  // ==========================================================================

  /**
   * Get users assigned to a role
   */
  async getUsersForRole(
    roleId: string,
    params?: { page?: number; pageSize?: number }
  ): Promise<ApiResponse<PaginatedResponse<RoleUser>>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    const query = searchParams.toString();
    return api.get(`/v1/roles/${roleId}/users${query ? `?${query}` : ''}`);
  },

  /**
   * Bulk assign a role to multiple users
   */
  async bulkAssignRole(roleId: string, userIds: string[]): Promise<ApiResponse<BulkOperationResult>> {
    return api.post(`/v1/roles/${roleId}/users`, { userIds });
  },

  /**
   * Bulk remove a role from multiple users
   */
  async bulkRemoveRole(roleId: string, userIds: string[]): Promise<ApiResponse<BulkOperationResult>> {
    return api.delete(`/v1/roles/${roleId}/users`, {
      body: JSON.stringify({ userIds }),
    });
  },

  /**
   * Assign a single role to a user
   */
  async assignRoleToUser(userId: string, roleId: string): Promise<ApiResponse<void>> {
    return api.post(`/v1/users/${userId}/roles`, { roleId });
  },

  /**
   * Remove a single role from a user
   */
  async removeRoleFromUser(userId: string, roleId: string): Promise<ApiResponse<void>> {
    return api.delete(`/v1/users/${userId}/roles/${roleId}`);
  },
};

export default rolesService;
