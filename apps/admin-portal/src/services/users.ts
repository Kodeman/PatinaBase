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

/** Helper to make JSON API calls to Next.js API routes */
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const usersService = {
  async getUsers(params?: {
    query?: string;
    status?: string;
    role?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: User[]; meta: { total: number; page: number; pageSize: number } }> {
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.append('query', params.query);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.role) searchParams.append('role', params.role);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    const qs = searchParams.toString();
    const json = await apiFetch<{ data: { data: User[]; meta: any } }>(`/api/users${qs ? `?${qs}` : ''}`);
    return json.data;
  },

  async getUser(userId: string): Promise<User> {
    const json = await apiFetch<{ data: User }>(`/api/users/${userId}`);
    return json.data;
  },

  async createUser(data: CreateUserRequest): Promise<CreateUserResponse> {
    const json = await apiFetch<{ data: CreateUserResponse }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return json.data;
  },

  async updateUser(userId: string, data: UpdateUserRequest): Promise<User> {
    const json = await apiFetch<{ data: User }>(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return json.data;
  },

  async getUserActivity(userId: string, params?: {
    limit?: number;
    offset?: number;
  }): Promise<AuditLogResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    const qs = searchParams.toString();
    const json = await apiFetch<{ data: AuditLogResponse }>(`/api/users/${userId}/activity${qs ? `?${qs}` : ''}`);
    return json.data;
  },

  async suspendUser(userId: string, reason?: string): Promise<void> {
    await apiFetch(`/api/users/${userId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async banUser(userId: string, reason?: string): Promise<void> {
    await apiFetch(`/api/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async reactivateUser(userId: string): Promise<void> {
    await apiFetch(`/api/users/${userId}/activate`, { method: 'POST' });
  },

  async verifyEmail(userId: string): Promise<void> {
    await apiFetch(`/api/users/${userId}/verify-email`, { method: 'POST' });
  },

  async getRoles(): Promise<Role[]> {
    const json = await apiFetch<{ data: Role[] }>('/api/roles');
    return json.data;
  },

  async assignRole(userId: string, roleId: string, reason?: string): Promise<void> {
    await apiFetch(`/api/users/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ roleId, reason }),
    });
  },

  async revokeRole(userId: string, roleId: string, reason?: string): Promise<void> {
    await apiFetch(`/api/users/${userId}/roles?roleId=${roleId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  },

  async getVerificationQueue(params?: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<DesignerProfile>> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());
    return apiFetch(`/api/admin/verification-queue?${searchParams.toString()}`);
  },

  async getDesignerProfile(userId: string): Promise<DesignerProfile> {
    const json = await apiFetch<{ data: DesignerProfile }>(`/api/designers/${userId}`);
    return json.data;
  },

  async approveDesigner(userId: string, notes?: string): Promise<void> {
    await apiFetch(`/api/admin/designers/${userId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ status: 'approved', notes }),
    });
  },

  async rejectDesigner(userId: string, notes: string): Promise<void> {
    await apiFetch(`/api/admin/designers/${userId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ status: 'rejected', notes }),
    });
  },

  async requestMoreInfo(userId: string, message: string): Promise<void> {
    await apiFetch(`/api/admin/designers/${userId}/request-info`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  async getUserSessions(userId: string): Promise<any[]> {
    const json = await apiFetch<{ data: any[] }>(`/api/users/${userId}/sessions`);
    return json.data;
  },

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await apiFetch(`/api/users/${userId}/sessions/${sessionId}`, { method: 'DELETE' });
  },

  async revokeAllSessions(userId: string): Promise<void> {
    await apiFetch(`/api/users/${userId}/sessions/revoke-all`, { method: 'POST' });
  },
};
