// Mission Control Transaction Tracker (WP-2.3) — the concierge order lifecycle
// data layer for /mission-control/orders. Talks to the /api/admin/concierge-
// orders routes, which proxy the SECURITY DEFINER RPCs / service-role reads in
// 00308. Query-key conventions + hooks live in hooks/use-concierge-orders.ts.

import type { Checklists, ConciergeStage, PaymentFlag } from '@/lib/concierge-stages';

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

// ─── Row shapes ──────────────────────────────────────────────────────────────

export interface DamagePhotoItem {
  key: string;
  label: string;
  done: boolean;
  done_at: string | null;
  by: string | null;
}

export interface DamageState {
  damage_claim_id: string;
  linked: boolean;
  photo_checklist: DamagePhotoItem[];
  carrier_deadline: string | null;
  window_started_at: string | null;
  state: 'open' | 'resolved';
  note: string | null;
}

export interface PaymentFlagDetail {
  checks: Array<{ name: string; expected: unknown; actual: unknown }>;
  verdict: string;
}

export interface ConciergeOrder {
  id: string;
  title: string;
  purchase_order_id: string | null;
  direct_order_id: string | null;
  client_invoice_id: string | null;
  vendor_id: string | null;
  project_id: string | null;
  stage: ConciergeStage;
  stage_entered_at: string;
  checklists: Checklists;
  freight: unknown | null;
  damage: DamageState | null;
  linked_task_ids: string[];
  payment_flag: PaymentFlag;
  payment_flag_detail: PaymentFlagDetail | null;
  created_at: string;
  updated_at: string;
  /** Denormalised vendor name for the list row (joined server-side). */
  vendor_name?: string | null;
}

/** A linked agent_task resolved for the detail "linked docs" panel. */
export interface LinkedTask {
  id: string;
  task_type: string;
  status: string;
  summary: string;
  artifacts: Record<string, unknown>;
  confidence: number | null;
  created_at: string;
}

export interface ConciergeOrderDetail extends ConciergeOrder {
  linked_tasks: LinkedTask[];
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface ConciergeOrderFilters {
  stage?: ConciergeStage;
  payment_flag?: PaymentFlag;
  search?: string;
}

export interface CreateConciergeOrderInput {
  title: string;
  purchase_order_id?: string | null;
  direct_order_id?: string | null;
  client_invoice_id?: string | null;
  vendor_id?: string | null;
  project_id?: string | null;
}

export interface AdvanceInput {
  toStage: ConciergeStage;
  force?: boolean;
  note?: string;
}

export interface ChecklistToggleInput {
  stage: ConciergeStage;
  key: string;
  done: boolean;
}

export interface EnterDamageInput {
  carrierDeadline?: string | null;
  damageClaimId?: string | null;
  note?: string | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const conciergeOrdersService = {
  async list(filters?: ConciergeOrderFilters): Promise<ConciergeOrder[]> {
    const params = new URLSearchParams();
    if (filters?.stage) params.append('stage', filters.stage);
    if (filters?.payment_flag) params.append('payment_flag', filters.payment_flag);
    if (filters?.search) params.append('search', filters.search);
    const qs = params.toString();
    return request<ConciergeOrder[]>(`/api/admin/concierge-orders${qs ? `?${qs}` : ''}`);
  },

  async get(id: string): Promise<ConciergeOrderDetail> {
    return request<ConciergeOrderDetail>(`/api/admin/concierge-orders/${id}`);
  },

  async create(input: CreateConciergeOrderInput): Promise<ConciergeOrder> {
    return request<ConciergeOrder>('/api/admin/concierge-orders', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async advance(id: string, input: AdvanceInput): Promise<{ id: string; from_stage: string; to_stage: string }> {
    return request(`/api/admin/concierge-orders/${id}/advance`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async toggleChecklistItem(id: string, input: ChecklistToggleInput): Promise<ConciergeOrder> {
    return request<ConciergeOrder>(`/api/admin/concierge-orders/${id}/checklist`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async enterDamageMode(id: string, input: EnterDamageInput = {}): Promise<ConciergeOrder> {
    return request<ConciergeOrder>(`/api/admin/concierge-orders/${id}/damage`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
