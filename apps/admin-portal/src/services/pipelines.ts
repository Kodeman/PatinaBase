// Mission Control Pipelines (WP-2.2) — the designer_prospects side of the
// two-board /mission-control/pipelines kanban. The maker board reuses
// pipelineService.listVendors (src/services/vendor-pipeline.ts) directly; it
// gets no new service here. Both boards share the stage-move endpoint below.

import type { DesignerProspectStage, VendorStage } from '@/lib/pipeline-stages';

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

export type ProspectOwner = 'kody' | 'leah';

export interface DesignerProspect {
  id: string;
  full_name: string;
  studio_name: string | null;
  email: string | null;
  portfolio_url: string | null;
  instagram: string | null;
  market_city: string | null;
  market_state: string | null;
  source: string | null;
  owner: ProspectOwner;
  stage: DesignerProspectStage;
  stage_entered_at: string;
  next_action: string | null;
  next_action_due: string | null;
  notes: string | null;
  profile_id: string | null;
  application_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignerProspectFilters {
  stage?: DesignerProspectStage;
  owner?: ProspectOwner;
  search?: string;
}

export interface CreateDesignerProspectInput {
  full_name: string;
  studio_name?: string | null;
  email?: string | null;
  portfolio_url?: string | null;
  instagram?: string | null;
  market_city?: string | null;
  market_state?: string | null;
  source?: string | null;
  owner?: ProspectOwner;
  next_action?: string | null;
  next_action_due?: string | null;
  notes?: string | null;
}

/** PATCH-able detail fields — stage is intentionally excluded; it moves only via moveStage(). */
export type UpdateDesignerProspectInput = Partial<Omit<CreateDesignerProspectInput, 'full_name'>> & {
  full_name?: string;
};

export type PipelineEntityType = 'designer_prospect' | 'pipeline_vendor' | 'concierge_order';

export interface StageMoveResult {
  entity_type: PipelineEntityType;
  entity_id: string;
  from_stage: string | null;
  to_stage: string;
  unchanged: boolean;
}

export const pipelinesService = {
  async listDesignerProspects(filters?: DesignerProspectFilters): Promise<DesignerProspect[]> {
    const params = new URLSearchParams();
    if (filters?.stage) params.append('stage', filters.stage);
    if (filters?.owner) params.append('owner', filters.owner);
    if (filters?.search) params.append('search', filters.search);
    const qs = params.toString();
    return request<DesignerProspect[]>(
      `/api/admin/pipelines/designer-prospects${qs ? `?${qs}` : ''}`,
    );
  },

  async createDesignerProspect(input: CreateDesignerProspectInput): Promise<DesignerProspect> {
    return request<DesignerProspect>('/api/admin/pipelines/designer-prospects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updateDesignerProspect(
    id: string,
    updates: UpdateDesignerProspectInput,
  ): Promise<DesignerProspect> {
    return request<DesignerProspect>(`/api/admin/pipelines/designer-prospects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  /** Shared by both boards: moves a designer_prospect OR a pipeline_vendor's stage. */
  async moveStage(input: {
    entityType: PipelineEntityType;
    entityId: string;
    toStage: DesignerProspectStage | VendorStage | string;
    note?: string;
  }): Promise<StageMoveResult> {
    return request<StageMoveResult>('/api/admin/pipelines/stage-move', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
