// ─────────────────────────────────────────────────────────────────────────────
// morning-brief service — client-side data slice for the Mission Control
// Morning Brief panel (WP-1.3). Mirrors services/agent-tasks.ts: a thin
// apiFetch wrapper over the /api/admin/mission-control/brief* Next.js
// routes, which are the only place the service-role client reads/writes
// public.daily_briefs.
//
// These types mirror supabase/functions/morning-brief/compose.ts's
// BriefContent shape. They're duplicated rather than imported because the
// edge function is Deno code and cannot be shared with this Node/Next.js
// package without a new workspace package — out of scope for this panel.
// Keep in sync if compose.ts's shape changes.
// ─────────────────────────────────────────────────────────────────────────────

export interface QueueStat {
  status: string;
  task_count: number;
  oldest_created_at: string | null;
}

export interface RunSummary {
  source: 'job_runs' | 'agent_task';
  name: string;
  status: string;
  started_at: string | null;
  duration_ms: number | null;
  error: string | null;
  cost_usd: number | null;
}

export interface StaleException {
  id: string;
  summary: string;
  age_hours: number;
}

export interface FailedException {
  id: string;
  summary: string;
  last_error: string | null;
}

export interface IntakeErrorException {
  id: string;
  summary: string;
}

export interface ExceptionsSection {
  stale: StaleException[];
  failed: FailedException[];
  intake_errors: IntakeErrorException[];
}

export interface TodaysThreeItem {
  id: string;
  summary: string;
  priority: number;
  assignee: string | null;
}

export interface VitalsSection {
  current: Record<string, unknown>;
  previous: Record<string, unknown> | null;
  deltas: Record<string, number> | null;
}

export interface BriefContent {
  brief_date: string;
  queue: QueueStat[];
  runs_yesterday: RunSummary[];
  exceptions: ExceptionsSection;
  todays_three: TodaysThreeItem[];
  vitals?: VitalsSection;
}

export interface DailyBrief {
  brief_date: string;
  content: BriefContent;
  generated_at: string;
  email_sent_at: string | null;
}

/** Helper to make JSON API calls to Next.js API routes (mirrors services/agent-tasks.ts). */
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

export const morningBriefService = {
  /** Today's Chicago-date brief, or the most recent one if today's hasn't landed. */
  async get(): Promise<DailyBrief | null> {
    const json = await apiFetch<{ data: DailyBrief | null }>('/api/admin/mission-control/brief');
    return json.data;
  },

  /** Admin "Regenerate" action — invokes the morning-brief edge function and returns the fresh row. */
  async regenerate(): Promise<DailyBrief | null> {
    const json = await apiFetch<{ data: DailyBrief | null }>(
      '/api/admin/mission-control/brief/regenerate',
      { method: 'POST' },
    );
    return json.data;
  },
};
