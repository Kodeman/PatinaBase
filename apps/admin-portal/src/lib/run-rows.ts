// ─────────────────────────────────────────────────────────────────────────────
// Run Log row model — PURE module (no React, no I/O).
//
// The Run Log (/mission-control/runs) is the anti-silent-failure surface: it
// UNIONs two run sources into one RunRow shape so a job or agent run that
// errored is visible within one grooming cycle.
//
//   (a) public.job_runs (00300)  — scheduled/background job run-log. kind='job'.
//   (b) public.agent_tasks (00297) — an agent task is run-relevant when it is
//       job-typed (task_type LIKE 'job:%' ⇒ kind='job') OR in a run status
//       (running/done/failed ⇒ kind='agent').
//
// The route fetches both (bounded), hands the raw rows here, and this module
// maps → unions → filters by view → sorts (startedAt desc, nulls last) →
// clamps to limit. Keeping it pure lets the jest suite assert the mapping,
// ordering and view filters without a database.
// ─────────────────────────────────────────────────────────────────────────────

export type RunKind = 'job' | 'agent';

/** The Run Log filter tabs. `stale` = flaggedStaleAt is set (queue-groom SLA). */
export type RunView = 'all' | 'jobs' | 'agents' | 'failed' | 'stale';

export const RUN_VIEWS: readonly RunView[] = ['all', 'jobs', 'agents', 'failed', 'stale'] as const;

export function isRunView(v: string | null | undefined): v is RunView {
  return v != null && (RUN_VIEWS as readonly string[]).includes(v);
}

/** One unified run, whatever its source. */
export interface RunRow {
  id: string;
  kind: RunKind;
  name: string;
  source: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  costUsd: number | null;
  error: string | null;
  retryCount: number | null;
  maxAttempts: number | null;
  parentTaskId: string | null;
  flaggedStaleAt: string | null;
}

// ─── Raw source rows (the subset of columns the mapper reads) ─────────────────

/** A public.job_runs row (00300). */
export interface JobRunSource {
  id: number | string;
  job_name: string;
  status: string; // running | succeeded | failed | skipped
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  cost_usd: number | string | null;
}

/** A public.agent_tasks row (00297) — the run-relevant subset. */
export interface AgentTaskSource {
  id: string;
  task_type: string;
  status: string;
  source: string;
  attempts: number | null;
  max_attempts: number | null;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  artifacts: Record<string, unknown> | null;
  parent_task_id: string | null;
  flagged_stale_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ms between started and finished; null while still running or unstarted. */
function durationMs(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, end - start);
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function mapJobRun(row: JobRunSource): RunRow {
  return {
    id: `job-${row.id}`,
    kind: 'job',
    name: row.job_name,
    source: 'job',
    status: row.status,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    durationMs: durationMs(row.started_at ?? null, row.finished_at ?? null),
    costUsd: toNumberOrNull(row.cost_usd),
    error: row.error ?? null,
    // job_runs has no attempt bookkeeping.
    retryCount: null,
    maxAttempts: null,
    parentTaskId: null,
    flaggedStaleAt: null,
  };
}

export function mapAgentTaskRun(row: AgentTaskSource): RunRow {
  // A job-typed agent task (task_type 'job:<name>') is a job run, not agent work.
  const kind: RunKind = row.task_type.startsWith('job:') ? 'job' : 'agent';
  const cost = (row.artifacts ?? {})['cost_usd'];
  return {
    id: `agent-${row.id}`,
    kind,
    name: row.task_type,
    source: row.source,
    status: row.status,
    startedAt: row.started_at ?? null,
    finishedAt: row.completed_at ?? null,
    durationMs: durationMs(row.started_at ?? null, row.completed_at ?? null),
    costUsd: toNumberOrNull(cost),
    error: row.last_error ?? null,
    retryCount: row.attempts ?? null,
    maxAttempts: row.max_attempts ?? null,
    parentTaskId: row.parent_task_id ?? null,
    flaggedStaleAt: row.flagged_stale_at ?? null,
  };
}

// ─── View filter + ordering ───────────────────────────────────────────────────

export function matchesView(row: RunRow, view: RunView): boolean {
  switch (view) {
    case 'jobs':
      return row.kind === 'job';
    case 'agents':
      return row.kind === 'agent';
    case 'failed':
      return row.status === 'failed';
    case 'stale':
      return row.flaggedStaleAt != null;
    case 'all':
    default:
      return true;
  }
}

/** startedAt desc, nulls last. Stable enough for the run log (ties keep input order). */
export function compareRuns(a: RunRow, b: RunRow): number {
  if (a.startedAt === b.startedAt) return 0;
  if (a.startedAt == null) return 1; // unstarted sinks to the bottom
  if (b.startedAt == null) return -1;
  const ta = Date.parse(a.startedAt);
  const tb = Date.parse(b.startedAt);
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return tb - ta;
}

export interface BuildRunRowsInput {
  jobRuns: JobRunSource[];
  agentTasks: AgentTaskSource[];
  view: RunView;
  limit: number;
}

/** Map both sources, union, filter by view, sort desc-by-startedAt, clamp. */
export function buildRunRows({ jobRuns, agentTasks, view, limit }: BuildRunRowsInput): RunRow[] {
  const rows: RunRow[] = [
    ...jobRuns.map(mapJobRun),
    ...agentTasks.map(mapAgentTaskRun),
  ].filter((r) => matchesView(r, view));

  rows.sort(compareRuns);

  const clamped = Math.max(1, Math.min(100, Math.trunc(limit) || 100));
  return rows.slice(0, clamped);
}
