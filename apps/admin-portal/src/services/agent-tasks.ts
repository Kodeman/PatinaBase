// ─────────────────────────────────────────────────────────────────────────────
// agent-tasks service — client-side data slice for the Mission Control inbox.
//
// Mirrors services/designers.ts: a thin apiFetch wrapper over the
// /api/admin/agent-tasks/* Next.js routes, which are the only place the
// service-role @patina/agent-queue layer runs. The browser never touches the
// queue RPCs directly.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AgentTask,
  AgentTaskAssignee,
  AgentTaskStatus,
  QueueStat,
  ReviewDecision,
} from '@patina/agent-queue';

export interface AgentTaskFilters {
  /** Defaults to 'awaiting_review' at the route when omitted. Pass 'all' to skip. */
  status?: AgentTaskStatus | 'all';
  assignee?: AgentTaskAssignee;
  taskType?: string;
  limit?: number;
}

export interface ReviewTaskInput {
  id: string;
  decision: ReviewDecision;
  note?: string | null;
  payloadPatch?: Record<string, unknown> | null;
  reviewMeta?: Record<string, unknown> | null;
}

/** Helper to make JSON API calls to Next.js API routes (mirrors services/designers.ts). */
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

function buildListQuery(filters: AgentTaskFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.assignee) params.set('assignee', filters.assignee);
  if (filters.taskType) params.set('task_type', filters.taskType);
  if (filters.limit != null) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const agentTasksService = {
  async list(filters: AgentTaskFilters = {}): Promise<AgentTask[]> {
    const json = await apiFetch<{ data: AgentTask[] }>(
      `/api/admin/agent-tasks${buildListQuery(filters)}`,
    );
    return json.data;
  },

  async get(id: string): Promise<AgentTask> {
    const json = await apiFetch<{ data: AgentTask }>(
      `/api/admin/agent-tasks/${encodeURIComponent(id)}`,
    );
    return json.data;
  },

  async review(input: ReviewTaskInput): Promise<AgentTask> {
    const json = await apiFetch<{ data: AgentTask }>(
      `/api/admin/agent-tasks/${encodeURIComponent(input.id)}/review`,
      {
        method: 'POST',
        body: JSON.stringify({
          decision: input.decision,
          note: input.note ?? null,
          payloadPatch: input.payloadPatch ?? null,
          reviewMeta: input.reviewMeta ?? null,
        }),
      },
    );
    return json.data;
  },

  async stats(): Promise<QueueStat[]> {
    const json = await apiFetch<{ data: QueueStat[] }>('/api/admin/agent-tasks/stats');
    return json.data;
  },
};
