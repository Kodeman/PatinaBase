import type { User, DesignerProfile, Role, PaginatedResponse, ApiResponse } from '@/types';

export const usersService = {
  // User Management
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

    const response = await fetch(`/api/admin/users?${searchParams.toString()}`);
    return response.json();
  },

  async getUser(userId: string): Promise<ApiResponse<User>> {
    const response = await fetch(`/api/admin/users/${userId}`);
    return response.json();
  },

  async updateUser(userId: string, data: Partial<User>): Promise<ApiResponse<User>> {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async suspendUser(userId: string, reason?: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/users/${userId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return response.json();
  },

  async banUser(userId: string, reason?: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/users/${userId}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return response.json();
  },

  async reactivateUser(userId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/users/${userId}/activate`, {
      method: 'POST',
    });
    return response.json();
  },

  async verifyEmail(userId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/users/${userId}/verify-email`, {
      method: 'POST',
    });
    return response.json();
  },

  // Role Management
  async getRoles(): Promise<ApiResponse<Role[]>> {
    const response = await fetch('/api/admin/roles');
    return response.json();
  },

  async assignRole(userId: string, roleId: string, reason?: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/users/${userId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId, reason }),
    });
    return response.json();
  },

  async revokeRole(userId: string, roleId: string, reason?: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/users/${userId}/roles/${roleId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return response.json();
  },

  // Designer Verification
  async getVerificationQueue(params?: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PaginatedResponse<DesignerProfile>>> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    const response = await fetch(`/api/admin/verification-queue?${searchParams.toString()}`);
    return response.json();
  },

  async getDesignerProfile(userId: string): Promise<ApiResponse<DesignerProfile>> {
    const response = await fetch(`/api/admin/designers/${userId}`);
    return response.json();
  },

  async approveDesigner(
    userId: string,
    notes?: string
  ): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/designers/${userId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'approved',
        notes,
      }),
    });
    return response.json();
  },

  async rejectDesigner(
    userId: string,
    notes: string
  ): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/designers/${userId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'rejected',
        notes,
      }),
    });
    return response.json();
  },

  async requestMoreInfo(
    userId: string,
    message: string
  ): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/designers/${userId}/request-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
      }),
    });
    return response.json();
  },

  // Sessions Management
  async getUserSessions(userId: string): Promise<ApiResponse<any[]>> {
    const response = await fetch(`/api/admin/users/${userId}/sessions`);
    return response.json();
  },

  async revokeSession(userId: string, sessionId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/users/${userId}/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  async revokeAllSessions(userId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/users/${userId}/sessions/revoke-all`, {
      method: 'POST',
    });
    return response.json();
  },
};
