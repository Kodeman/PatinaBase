/**
 * Waitlist Service Layer
 * Handles API interactions for waitlist management in admin portal
 */

// =============================================================================
// Types
// =============================================================================

export type QualificationStage =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'nurture'
  | 'converted'
  | 'disqualified';

export type WaitlistRole = 'designer' | 'consumer' | 'vendor' | 'unknown';

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
  // CRM extensions
  qualificationStage: QualificationStage;
  assignedAdminId: string | null;
  fullName: string | null;
  companyName: string | null;
  phone: string | null;
  notes: string | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  disqualifiedReason: string | null;
}

export interface WaitlistEntryPatch {
  qualificationStage?: QualificationStage;
  assignedAdminId?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  notes?: string | null;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  disqualifiedReason?: string | null;
}

export type WaitlistActivityKind =
  | 'note'
  | 'email_sent'
  | 'call_logged'
  | 'stage_changed'
  | 'assigned'
  | 'contacted'
  | 'qualified'
  | 'disqualified'
  | 'converted'
  | 'task_created'
  | 'task_completed';

export interface WaitlistActivity {
  id: string;
  waitlistId: string;
  actorAdminId: string | null;
  kind: WaitlistActivityKind;
  body: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface WaitlistTask {
  id: string;
  waitlistId: string;
  assignedAdminId: string | null;
  createdBy: string | null;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WaitlistStats {
  total: number;
  bySource: Record<string, number>;
  byRole: Record<string, number>;
  byStage: Record<QualificationStage, number>;
  converted: number;
  unconverted: number;
  overdueFollowUps: number;
}

export interface WaitlistFilters {
  search?: string;
  status?: 'all' | 'pending' | 'converted';
  role?: string;
  source?: string;
  stage?: QualificationStage | 'all';
  assignedTo?: string | 'me';
  hasOverdueFollowUp?: boolean;
  page?: number;
  pageSize?: number;
}

interface PaginatedData<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}

// =============================================================================
// Fetch helpers
// =============================================================================

async function unwrap<T>(res: Response): Promise<T> {
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

async function get<T>(path: string): Promise<T> {
  return unwrap<T>(await fetch(path));
}

async function send<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  return unwrap<T>(
    await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
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
    if (filters?.stage && filters.stage !== 'all') params.append('stage', filters.stage);
    if (filters?.assignedTo) params.append('assignedTo', filters.assignedTo);
    if (filters?.hasOverdueFollowUp) params.append('hasOverdueFollowUp', 'true');
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.pageSize) params.append('pageSize', filters.pageSize.toString());

    const query = params.toString();
    return get<PaginatedData<WaitlistEntry>>(`/api/waitlist${query ? `?${query}` : ''}`);
  },

  async getStats(): Promise<WaitlistStats> {
    return get<WaitlistStats>('/api/waitlist/stats');
  },

  async getEntry(id: string): Promise<WaitlistEntry> {
    return get<WaitlistEntry>(`/api/waitlist/${id}`);
  },

  async updateEntry(id: string, patch: WaitlistEntryPatch): Promise<WaitlistEntry> {
    return send<WaitlistEntry>(`/api/waitlist/${id}`, 'PATCH', patch);
  },

  async listActivities(id: string): Promise<WaitlistActivity[]> {
    return get<WaitlistActivity[]>(`/api/waitlist/${id}/activities`);
  },

  async logActivity(
    id: string,
    body: { kind: WaitlistActivityKind; body?: string; metadata?: Record<string, unknown> },
  ): Promise<WaitlistActivity> {
    return send<WaitlistActivity>(`/api/waitlist/${id}/activities`, 'POST', body);
  },

  async listTasks(id: string): Promise<WaitlistTask[]> {
    return get<WaitlistTask[]>(`/api/waitlist/${id}/tasks`);
  },

  async createTask(
    id: string,
    body: { title: string; dueDate?: string | null; assignedAdminId?: string | null },
  ): Promise<WaitlistTask> {
    return send<WaitlistTask>(`/api/waitlist/${id}/tasks`, 'POST', body);
  },

  async updateTask(
    waitlistId: string,
    taskId: string,
    patch: { completed?: boolean; title?: string; dueDate?: string | null; assignedAdminId?: string | null },
  ): Promise<WaitlistTask> {
    return send<WaitlistTask>(`/api/waitlist/${waitlistId}/tasks/${taskId}`, 'PATCH', patch);
  },
};
