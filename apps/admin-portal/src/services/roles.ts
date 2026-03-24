/**
 * Roles & Permissions Service Layer
 * Handles all API interactions for role and permission management
 *
 * Uses direct fetch to Next.js API routes (not the shared api-client,
 * since these routes are local to the admin portal).
 */

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

interface PaginatedData<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}

// =============================================================================
// Fetch Helpers
// =============================================================================

class ServiceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      // ignore parse error
    }
    throw new ServiceError(message, res.status);
  }

  const json = await res.json();
  return json.data as T;
}

// =============================================================================
// Roles Service
// =============================================================================

export const rolesService = {
  // ==========================================================================
  // Role CRUD
  // ==========================================================================

  async getRoles(): Promise<Role[]> {
    return request<Role[]>('/api/roles');
  },

  async getRole(roleId: string): Promise<Role> {
    return request<Role>(`/api/roles/${roleId}`);
  },

  async createRole(data: CreateRoleRequest): Promise<Role> {
    return request<Role>('/api/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateRole(roleId: string, data: UpdateRoleRequest): Promise<Role> {
    return request<Role>(`/api/roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteRole(
    roleId: string,
    force = false
  ): Promise<{ success: boolean; deletedRole: string; usersAffected: number }> {
    return request(`/api/roles/${roleId}?force=${force}`, {
      method: 'DELETE',
    });
  },

  async cloneRole(sourceRoleId: string, data: CloneRoleRequest): Promise<Role> {
    return request<Role>(`/api/roles/${sourceRoleId}/clone`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ==========================================================================
  // Permission Management
  // ==========================================================================

  async getPermissions(): Promise<GroupedPermissionsResponse> {
    // The single /api/permissions route returns grouped data
    return request<GroupedPermissionsResponse>('/api/permissions');
  },

  async getPermissionsGrouped(): Promise<GroupedPermissionsResponse> {
    return request<GroupedPermissionsResponse>('/api/permissions');
  },

  async replacePermissions(roleId: string, permissionIds: string[]): Promise<Role> {
    return request<Role>(`/api/roles/${roleId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionIds }),
    });
  },

  async addPermissions(roleId: string, permissionIds: string[]): Promise<Role> {
    return request<Role>(`/api/roles/${roleId}/permissions`, {
      method: 'POST',
      body: JSON.stringify({ permissionIds }),
    });
  },

  async removePermissions(roleId: string, permissionIds: string[]): Promise<Role> {
    return request<Role>(`/api/roles/${roleId}/permissions`, {
      method: 'DELETE',
      body: JSON.stringify({ permissionIds }),
    });
  },

  // ==========================================================================
  // User Assignment
  // ==========================================================================

  async getUsersForRole(
    roleId: string,
    params?: { page?: number; pageSize?: number }
  ): Promise<PaginatedData<RoleUser>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    const query = searchParams.toString();
    return request<PaginatedData<RoleUser>>(
      `/api/roles/${roleId}/users${query ? `?${query}` : ''}`
    );
  },

  async bulkAssignRole(roleId: string, userIds: string[]): Promise<BulkOperationResult> {
    return request<BulkOperationResult>(`/api/roles/${roleId}/users`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  },

  async bulkRemoveRole(roleId: string, userIds: string[]): Promise<BulkOperationResult> {
    return request<BulkOperationResult>(`/api/roles/${roleId}/users`, {
      method: 'DELETE',
      body: JSON.stringify({ userIds }),
    });
  },

  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    await request<{ success: boolean }>(`/api/users/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ roleId }),
    });
  },

  async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    await request<{ success: boolean }>(`/api/users/${userId}/roles?roleId=${roleId}`, {
      method: 'DELETE',
    });
  },
};

export default rolesService;
