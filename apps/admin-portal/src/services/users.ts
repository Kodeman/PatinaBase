import { userManagementApi } from '@/lib/api-client';
const api = userManagementApi as any;
import type { User, DesignerProfile, Role, PaginatedResponse, ApiResponse } from '@/types';

export interface CreateUserRequest {
  email: string;
  displayName?: string;
  roleIds?: string[];
}

export interface CreateUserResponse {
  user: User;
  invitationSent: boolean;
}

export interface UpdateUserRequest {
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
}

export interface AuditLogEntry {
  id: string;
  actorId?: string;
  actorType?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  result: 'success' | 'failure' | 'denied';
  errorCode?: string;
  metadata?: Record<string, any>;
}

export interface AuditLogResponse {
  data: AuditLogEntry[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export const usersService = {
  // User Management
  // Note: Base URL is /api/users, so paths are relative to that
  async getUsers(params?: {
    query?: string;
    status?: string;
    role?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PaginatedResponse<User>>> {
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.append('query', params.query);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.role) searchParams.append('role', params.role);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    const query = searchParams.toString();
    return api.get(`/${query ? `?${query}` : ''}`);
  },

  async getUser(userId: string): Promise<ApiResponse<User>> {
    return api.get(`/${userId}`);
  },

  async createUser(data: CreateUserRequest): Promise<ApiResponse<CreateUserResponse>> {
    return api.post('/', data);
  },

  async updateUser(userId: string, data: UpdateUserRequest): Promise<ApiResponse<User>> {
    return api.patch(`/${userId}`, data);
  },

  async getUserActivity(userId: string, params?: {
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<AuditLogResponse>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    const query = searchParams.toString();
    return api.get(`/${userId}/activity${query ? `?${query}` : ''}`);
  },

  async suspendUser(userId: string, reason?: string): Promise<ApiResponse<void>> {
    return api.post(`/${userId}/suspend`, { reason });
  },

  async banUser(userId: string, reason?: string): Promise<ApiResponse<void>> {
    return api.post(`/${userId}/ban`, { reason });
  },

  async reactivateUser(userId: string): Promise<ApiResponse<void>> {
    return api.post(`/${userId}/activate`);
  },

  async verifyEmail(userId: string): Promise<ApiResponse<void>> {
    return api.post(`/${userId}/verify-email`);
  },

  // Role Management - these use a different base path
  async getRoles(): Promise<ApiResponse<Role[]>> {
    // Roles endpoint is at /api/roles, not /api/users
    return fetch('/api/roles').then(r => r.json());
  },

  async assignRole(userId: string, roleId: string, reason?: string): Promise<ApiResponse<void>> {
    return api.post(`/${userId}/roles`, { roleId, reason });
  },

  async revokeRole(userId: string, roleId: string, reason?: string): Promise<ApiResponse<void>> {
    return api.delete(`/${userId}/roles/${roleId}`, {
      body: JSON.stringify({ reason }),
    });
  },

  // Designer Verification - uses admin API routes
  async getVerificationQueue(params?: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PaginatedResponse<DesignerProfile>>> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    return fetch(`/api/admin/verification-queue?${searchParams.toString()}`).then(r => r.json());
  },

  async getDesignerProfile(userId: string): Promise<ApiResponse<DesignerProfile>> {
    return fetch(`/api/designers/${userId}`).then(r => r.json());
  },

  async approveDesigner(
    userId: string,
    notes?: string
  ): Promise<ApiResponse<void>> {
    return fetch(`/api/admin/designers/${userId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', notes }),
    }).then(r => r.json());
  },

  async rejectDesigner(
    userId: string,
    notes: string
  ): Promise<ApiResponse<void>> {
    return fetch(`/api/admin/designers/${userId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected', notes }),
    }).then(r => r.json());
  },

  async requestMoreInfo(
    userId: string,
    message: string
  ): Promise<ApiResponse<void>> {
    return fetch(`/api/admin/designers/${userId}/request-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).then(r => r.json());
  },

  // Sessions Management
  async getUserSessions(userId: string): Promise<ApiResponse<any[]>> {
    return api.get(`/${userId}/sessions`);
  },

  async revokeSession(userId: string, sessionId: string): Promise<ApiResponse<void>> {
    return api.delete(`/${userId}/sessions/${sessionId}`);
  },

  async revokeAllSessions(userId: string): Promise<ApiResponse<void>> {
    return api.post(`/${userId}/sessions/revoke-all`);
  },
};
