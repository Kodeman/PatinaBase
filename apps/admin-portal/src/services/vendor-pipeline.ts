import type { VendorPipeline } from '@patina/types';

type Vendor = VendorPipeline.Vendor;
type VendorWithActivity = VendorPipeline.VendorWithActivity;
type CoworkTask = VendorPipeline.CoworkTask;
type CoworkTaskType = VendorPipeline.CoworkTaskType;
type PipelineMetrics = VendorPipeline.PipelineMetrics;
type VendorStage = VendorPipeline.VendorStage;
type TriageLevel = VendorPipeline.TriageLevel;
type ScoredBy = VendorPipeline.ScoredBy;

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

export interface VendorListFilters {
  stage?: VendorStage;
  triage_level?: TriageLevel;
  awaiting_leah?: boolean;
  sort_by?: 'total_score' | 'updated_at' | 'name' | 'stage';
  sort_dir?: 'asc' | 'desc';
  search?: string;
}

export interface CreateVendorInput {
  name: string;
  website_url?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
  product_categories?: string[];
  price_range_low?: number | null;
  price_range_high?: number | null;
  source?: string | null;
  notes?: string | null;
  auto_score?: boolean;
}

export interface UpsertScoreInput {
  dimension: number;
  raw_score: number;
  scored_by: ScoredBy;
  evidence?: string;
}

export interface LeahReviewInput {
  scores: Array<{ dimension: number; raw_score: number; evidence?: string }>;
  leah_notes?: string;
}

export interface CoworkTaskFilters {
  status?: string;
  vendor_id?: string;
  task_type?: CoworkTaskType;
  limit?: number;
}

export interface CreateCoworkTaskInput {
  task_type: CoworkTaskType;
  vendor_id?: string | null;
  input_payload?: Record<string, unknown>;
  is_recurring?: boolean;
  cron_expression?: string | null;
}

export const pipelineService = {
  async listVendors(filters?: VendorListFilters): Promise<Vendor[]> {
    const params = new URLSearchParams();
    if (filters?.stage) params.append('stage', filters.stage);
    if (filters?.triage_level) params.append('triage_level', filters.triage_level);
    if (filters?.awaiting_leah) params.append('awaiting_leah', 'true');
    if (filters?.sort_by) params.append('sort_by', filters.sort_by);
    if (filters?.sort_dir) params.append('sort_dir', filters.sort_dir);
    if (filters?.search) params.append('search', filters.search);
    const qs = params.toString();
    return request<Vendor[]>(`/api/admin/vendors${qs ? `?${qs}` : ''}`);
  },

  async getVendor(slug: string): Promise<VendorWithActivity> {
    return request<VendorWithActivity>(`/api/admin/vendors/${encodeURIComponent(slug)}`);
  },

  async createVendor(input: CreateVendorInput): Promise<Vendor> {
    return request<Vendor>('/api/admin/vendors', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updateVendor(slug: string, updates: Partial<Vendor>): Promise<Vendor> {
    return request<Vendor>(`/api/admin/vendors/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async advanceStage(slug: string, stage: VendorStage): Promise<Vendor> {
    return request<Vendor>(`/api/admin/vendors/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body: JSON.stringify({ stage }),
    });
  },

  async upsertScore(slug: string, input: UpsertScoreInput): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/admin/vendors/${encodeURIComponent(slug)}/scores`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async submitLeahReview(
    slug: string,
    input: LeahReviewInput,
  ): Promise<{ ok: true; total_score: number; triage_level: TriageLevel }> {
    return request(`/api/admin/vendors/${encodeURIComponent(slug)}/leah-review`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async listCoworkTasks(filters?: CoworkTaskFilters): Promise<CoworkTask[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.vendor_id) params.append('vendor_id', filters.vendor_id);
    if (filters?.task_type) params.append('task_type', filters.task_type);
    if (filters?.limit) params.append('limit', String(filters.limit));
    const qs = params.toString();
    return request<CoworkTask[]>(`/api/admin/cowork-tasks${qs ? `?${qs}` : ''}`);
  },

  async createCoworkTask(input: CreateCoworkTaskInput): Promise<CoworkTask> {
    return request<CoworkTask>('/api/admin/cowork-tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async cancelCoworkTask(id: string): Promise<CoworkTask> {
    return request<CoworkTask>(`/api/admin/cowork-tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel' }),
    });
  },

  async getActiveTaskCount(): Promise<number> {
    const data = await request<{ count: number }>('/api/admin/cowork-tasks/active-count');
    return data.count;
  },

  async getMetrics(): Promise<PipelineMetrics> {
    return request<PipelineMetrics>('/api/admin/pipeline-metrics');
  },
};
