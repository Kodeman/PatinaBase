/**
 * Waitlist Service Layer
 * Handles API interactions for waitlist management in admin portal
 */

// =============================================================================
// Types
// =============================================================================

export interface WaitlistEntry {
  id: string;
  email: string;
  source: string;
  role: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrer: string | null;
  signupPage: string | null;
  ctaText: string | null;
  createdAt: string;
  updatedAt: string;
  convertedAt: string | null;
  authUserId: string | null;
}

export interface WaitlistStats {
  total: number;
  bySource: Record<string, number>;
  byRole: Record<string, number>;
  converted: number;
  unconverted: number;
}

export interface WaitlistFilters {
  search?: string;
  status?: 'all' | 'pending' | 'converted';
  role?: string;
  source?: string;
  page?: number;
  pageSize?: number;
}

interface PaginatedData<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}

// =============================================================================
// Fetch Helper
// =============================================================================

async function request<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const json = await res.json();
  return json.data as T;
}

// =============================================================================
// Service
// =============================================================================

export const waitlistService = {
  async getEntries(filters?: WaitlistFilters): Promise<PaginatedData<WaitlistEntry>> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.role) params.append('role', filters.role);
    if (filters?.source) params.append('source', filters.source);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.pageSize) params.append('pageSize', filters.pageSize.toString());

    const query = params.toString();
    return request<PaginatedData<WaitlistEntry>>(`/api/waitlist${query ? `?${query}` : ''}`);
  },

  async getStats(): Promise<WaitlistStats> {
    return request<WaitlistStats>('/api/waitlist/stats');
  },
};
