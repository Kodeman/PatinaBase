export type ApplicationType = 'designer' | 'maker';
export type ApplicationStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'waitlisted'
  | 'rejected'
  | 'onboarding'
  | 'active'
  | 'archived';

export interface DesignerApplication {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string | null;
  website: string | null;
  motivation: string | null;
  referral_source: string | null;
  location: string | null;
  sourcing_process: string | null;
  status: ApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  auth_user_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MakerApplication {
  id: string;
  email: string;
  brand_name: string;
  contact_name: string;
  website: string | null;
  description: string | null;
  referral_source: string | null;
  location: string | null;
  materials: string | null;
  trade_program: string | null;
  status: ApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  auth_user_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Application = DesignerApplication | MakerApplication;

export interface ApplicationCommunication {
  id: string;
  application_type: ApplicationType;
  application_id: string;
  sent_by: string | null;
  channel: string;
  template_id: string | null;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  to_email: string;
  provider_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

export interface ApplicationsFilters {
  status?: ApplicationStatus | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedApplications<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}

function typePath(type: ApplicationType): string {
  return type === 'designer' ? 'designers' : 'makers';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data as T;
}

export const applicationsService = {
  async list<T extends Application>(
    type: ApplicationType,
    filters?: ApplicationsFilters,
  ): Promise<PaginatedApplications<T>> {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    const qs = params.toString();
    return request<PaginatedApplications<T>>(
      `/api/admin/applications/${typePath(type)}${qs ? `?${qs}` : ''}`,
    );
  },

  async get<T extends Application>(
    type: ApplicationType,
    id: string,
  ): Promise<{ application: T; communications: ApplicationCommunication[] }> {
    return request<{ application: T; communications: ApplicationCommunication[] }>(
      `/api/admin/applications/${typePath(type)}/${id}`,
    );
  },

  async update<T extends Application>(
    type: ApplicationType,
    id: string,
    updates: { status?: ApplicationStatus; reviewNotes?: string },
  ): Promise<T> {
    return request<T>(`/api/admin/applications/${typePath(type)}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async onboard(
    type: ApplicationType,
    id: string,
    payload?: {
      displayName?: string;
      roleName?: string;
      additionalRoleIds?: string[];
      personalObservation?: string;
    },
  ): Promise<{ userId: string; email: string; roleAssigned: string }> {
    return request(`/api/admin/applications/${typePath(type)}/${id}/onboard`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  },

  async sendEmail(
    type: ApplicationType,
    id: string,
    payload: { subject: string; html: string; text?: string; presetSlug?: string },
  ): Promise<{ communication: ApplicationCommunication }> {
    return request(`/api/admin/applications/${typePath(type)}/${id}/email`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
