import type {
  Studio,
  StudioMember,
  StudioProject,
  StudioOwner,
  UserStudioMembership,
} from '@/types';
import type { AuditLogResponse } from '@/services/users';

/** Helper to make JSON API calls to Next.js API routes (mirrors services/users.ts). */
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

export interface CreateStudioRequest {
  ownerUserId: string;
  name: string;
}

export interface UpdateStudioRequest {
  name?: string;
  slug?: string;
  website?: string | null;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  subscriptionTier?: string;
  address?: Record<string, unknown> | null;
}

export interface AddStudioMemberRequest {
  userId: string;
  role?: string;
  teammateType?: string;
  jobTitle?: string;
  staffRole?: string;
}

export interface UpdateStudioMemberRequest {
  role?: string;
  jobTitle?: string | null;
  staffRole?: string | null;
}

/** Success body of the workspace-member-invite edge fn (supabase/functions/workspace-member-invite/index.ts). */
export interface InviteStudioMemberResult {
  userId: string;
  email: string;
  status: string;
  organizationId: string;
  teammateType: string;
  memberRole: string;
  actorKind: string;
  email_status?: 'sent' | 'failed' | 'suppressed';
  email_error?: string;
  actionLink?: string;
}

export interface InviteStudioMemberRequest {
  email: string;
  role: string;
  name?: string;
  jobTitle?: string;
  staffRole?: string;
  teammateType?: string;
  resend?: boolean;
}

export const studiosService = {
  async getStudios(params?: {
    query?: string;
    status?: string;
    tier?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: Studio[]; meta: { total: number; page: number; pageSize: number } }> {
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.append('query', params.query);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.tier) searchParams.append('tier', params.tier);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    const qs = searchParams.toString();
    const json = await apiFetch<{ data: { data: Studio[]; meta: any } }>(
      `/api/admin/studios${qs ? `?${qs}` : ''}`,
    );
    return json.data;
  },

  async getStudio(studioId: string): Promise<Studio> {
    const json = await apiFetch<{ data: Studio }>(`/api/admin/studios/${studioId}`);
    return json.data;
  },

  async createStudio(data: CreateStudioRequest): Promise<{ studioId: string }> {
    const json = await apiFetch<{ data: { studioId: string } }>('/api/admin/studios', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return json.data;
  },

  async updateStudio(studioId: string, data: UpdateStudioRequest): Promise<Studio> {
    const json = await apiFetch<{ data: Studio }>(`/api/admin/studios/${studioId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return json.data;
  },

  async setStudioStatus(studioId: string, status: string, reason?: string): Promise<void> {
    await apiFetch(`/api/admin/studios/${studioId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    });
  },

  async getStudioMembers(studioId: string): Promise<StudioMember[]> {
    const json = await apiFetch<{ data: StudioMember[] }>(`/api/admin/studios/${studioId}/members`);
    return json.data;
  },

  async addStudioMember(studioId: string, data: AddStudioMemberRequest): Promise<StudioMember> {
    const json = await apiFetch<{ data: StudioMember }>(`/api/admin/studios/${studioId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return json.data;
  },

  async updateStudioMember(
    studioId: string,
    memberId: string,
    data: UpdateStudioMemberRequest,
  ): Promise<StudioMember> {
    const json = await apiFetch<{ data: StudioMember }>(
      `/api/admin/studios/${studioId}/members/${memberId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    );
    return json.data;
  },

  async removeStudioMember(studioId: string, memberId: string): Promise<void> {
    await apiFetch(`/api/admin/studios/${studioId}/members/${memberId}`, { method: 'DELETE' });
  },

  async inviteStudioMember(
    studioId: string,
    data: InviteStudioMemberRequest,
  ): Promise<InviteStudioMemberResult> {
    const json = await apiFetch<{ data: InviteStudioMemberResult }>(
      `/api/admin/studios/${studioId}/invites`,
      { method: 'POST', body: JSON.stringify(data) },
    );
    return json.data;
  },

  async transferOwnership(studioId: string, newOwnerUserId: string): Promise<void> {
    await apiFetch(`/api/admin/studios/${studioId}/transfer-ownership`, {
      method: 'POST',
      body: JSON.stringify({ newOwnerUserId }),
    });
  },

  async getStudioProjects(
    studioId: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<{ data: StudioProject[]; meta: { total: number; page: number; pageSize: number } }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());
    const qs = searchParams.toString();
    const json = await apiFetch<{ data: { data: StudioProject[]; meta: any } }>(
      `/api/admin/studios/${studioId}/projects${qs ? `?${qs}` : ''}`,
    );
    return json.data;
  },

  async getStudioActivity(
    studioId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<AuditLogResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    const qs = searchParams.toString();
    const json = await apiFetch<{ data: AuditLogResponse }>(
      `/api/admin/studios/${studioId}/activity${qs ? `?${qs}` : ''}`,
    );
    return json.data;
  },

  async searchUsers(params: {
    q: string;
    limit?: number;
    excludeStudioId?: string;
  }): Promise<StudioOwner[]> {
    const searchParams = new URLSearchParams();
    searchParams.append('q', params.q);
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.excludeStudioId) searchParams.append('excludeStudioId', params.excludeStudioId);
    const json = await apiFetch<{ data: StudioOwner[] }>(
      `/api/admin/studios/user-search?${searchParams.toString()}`,
    );
    return json.data;
  },

  async getUserStudios(userId: string): Promise<UserStudioMembership[]> {
    const json = await apiFetch<{ data: UserStudioMembership[] }>(`/api/users/${userId}/studios`);
    return json.data;
  },
};
