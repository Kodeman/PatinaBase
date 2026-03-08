/**
 * Roles & Permissions Service Layer (Admin)
 * Handles all API interactions for role and permission management
 */

import type { ApiResponse, PaginatedResponse } from '@/types';

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
    const response = await fetch('/api/admin/roles');
    return response.json();
  },

  /**
   * Get a single role by ID
   */
  async getRole(roleId: string): Promise<ApiResponse<Role>> {
    const response = await fetch(`/api/admin/roles/${roleId}`);
    return response.json();
  },

  /**
   * Create a new custom role
   */
  async createRole(data: CreateRoleRequest): Promise<ApiResponse<Role>> {
    const response = await fetch('/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  /**
   * Update a role (custom roles only)
   */
  async updateRole(roleId: string, data: UpdateRoleRequest): Promise<ApiResponse<Role>> {
    const response = await fetch(`/api/admin/roles/${roleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  /**
   * Delete a role (custom roles only)
   */
  async deleteRole(roleId: string, force = false): Promise<ApiResponse<{ success: boolean; deletedRole: string; usersAffected: number }>> {
    const response = await fetch(`/api/admin/roles/${roleId}?force=${force}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  /**
   * Clone an existing role (including system roles)
   */
  async cloneRole(sourceRoleId: string, data: CloneRoleRequest): Promise<ApiResponse<Role>> {
    const response = await fetch(`/api/admin/roles/${sourceRoleId}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  // ==========================================================================
  // Permission Management
  // ==========================================================================

  /**
   * Get all permissions (flat list)
   */
  async getPermissions(): Promise<ApiResponse<Permission[]>> {
    const response = await fetch('/api/admin/permissions');
    return response.json();
  },

  /**
   * Get all permissions grouped by domain
   */
  async getPermissionsGrouped(): Promise<ApiResponse<GroupedPermissionsResponse>> {
    const response = await fetch('/api/admin/permissions/grouped');
    return response.json();
  },

  /**
   * Replace all permissions on a role
   */
  async replacePermissions(roleId: string, permissionIds: string[]): Promise<ApiResponse<Role>> {
    const response = await fetch(`/api/admin/roles/${roleId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissionIds }),
    });
    return response.json();
  },

  /**
   * Add permissions to a role
   */
  async addPermissions(roleId: string, permissionIds: string[]): Promise<ApiResponse<Role>> {
    const response = await fetch(`/api/admin/roles/${roleId}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissionIds }),
    });
    return response.json();
  },

  /**
   * Remove permissions from a role
   */
  async removePermissions(roleId: string, permissionIds: string[]): Promise<ApiResponse<Role>> {
    const response = await fetch(`/api/admin/roles/${roleId}/permissions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissionIds }),
    });
    return response.json();
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
    const response = await fetch(`/api/admin/roles/${roleId}/users${query ? `?${query}` : ''}`);
    return response.json();
  },

  /**
   * Bulk assign a role to multiple users
   */
  async bulkAssignRole(roleId: string, userIds: string[]): Promise<ApiResponse<BulkOperationResult>> {
    const response = await fetch(`/api/admin/roles/${roleId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds }),
    });
    return response.json();
  },

  /**
   * Bulk remove a role from multiple users
   */
  async bulkRemoveRole(roleId: string, userIds: string[]): Promise<ApiResponse<BulkOperationResult>> {
    const response = await fetch(`/api/admin/roles/${roleId}/users`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds }),
    });
    return response.json();
  },

  /**
   * Assign a single role to a user
   */
  async assignRoleToUser(userId: string, roleId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/users/${userId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId }),
    });
    return response.json();
  },

  /**
   * Remove a single role from a user
   */
  async removeRoleFromUser(userId: string, roleId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/users/${userId}/roles/${roleId}`, {
      method: 'DELETE',
    });
    return response.json();
  },
};

export default rolesService;
