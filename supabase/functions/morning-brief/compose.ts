// Pure, side-effect-free composition for the morning-brief edge function
// (WP-1.3). No Supabase client, no Deno.env, no I/O — everything here takes
// plain data in and returns plain data out, so it unit-tests offline via
// `deno test` (see supabase/functions/_tests/morning-brief.test.ts). The
// index.ts entry does all the DB reads/writes and calls composeBriefContent
// with the rows it fetched.

// ─── Chicago calendar-date helpers ──────────────────────────────────────────
// Temporal isn't available in this Deno runtime; America/Chicago (CDT -05:00 /
// CST -06:00) is derived via Intl.DateTimeFormat instead.

/** The America/Chicago calendar date (YYYY-MM-DD) containing `date`. */
export function chicagoDateOf(date: Date): string {
  // en-CA formats as YYYY-MM-DD directly — no manual part reassembly needed.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** UTC-vs-Chicago offset in minutes (negative) at the given instant. */
function chicagoOffsetMinutesAt(instant: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant).map((p) => [p.type, p.value]),
  );
  const asUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtcMs - instant.getTime()) / 60000);
}

/** UTC ms instant of America/Chicago local midnight for calendar date `ymd`. */
function chicagoMidnightUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const naiveUtcMidnightMs = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset1 = chicagoOffsetMinutesAt(new Date(naiveUtcMidnightMs));
  let candidateMs = naiveUtcMidnightMs - offset1 * 60000;
  // Self-correct once: on the two days a year the DST transition falls
  // between the naive UTC-midnight probe and the true Chicago-local-midnight
  // instant, the offset at the first candidate can differ from the offset
  // that actually applies there.
  const offset2 = chicagoOffsetMinutesAt(new Date(candidateMs));
  if (offset2 !== offset1) {
    candidateMs = naiveUtcMidnightMs - offset2 * 60000;
  }
  return candidateMs;
}

/** The calendar date (YYYY-MM-DD, UTC arithmetic — no timezone involved) after `ymd`. */
function nextYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The [start, end) UTC instants spanning one America/Chicago calendar date
 * (local midnight to the FOLLOWING local midnight), as ISO strings. Not
 * always exactly 24h — the spring-forward day is 23h and the fall-back day
 * is 25h locally — so `end` is derived from the next date's own local
 * midnight rather than assumed as `start + 24h`.
 */
export function chicagoDayBoundsUtc(ymd: string): { startUtc: string; endUtc: string } {
  const startMs = chicagoMidnightUtcMs(ymd);
  const endMs = chicagoMidnightUtcMs(nextYmd(ymd));
  return { startUtc: new Date(startMs).toISOString(), endUtc: new Date(endMs).toISOString() };
}

/** The America/Chicago calendar date immediately before `ymd`. */
export function previousChicagoDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // Noon UTC is always mid-afternoon/mid-morning in Chicago regardless of
  // offset, so subtracting exactly 24h and re-deriving the Chicago date is
  // immune to DST edge cases (no local-midnight boundary math needed here).
  const noonUtcMs = Date.UTC(y, m - 1, d, 12, 0, 0);
  return chicagoDateOf(new Date(noonUtcMs - 24 * 60 * 60 * 1000));
}

// ─── Row shapes (as selected from Postgres) ─────────────────────────────────

export interface QueueStatRow {
  status: string;
  task_count: number;
  oldest_created_at: string | null;
}

export interface JobRunRow {
  job_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  cost_usd: number | null;
}

export interface AgentTaskRow {
  id: string;
  task_type: string;
  status: string;
  priority: number;
  assignee: string | null;
  summary: string;
  flagged_stale_at: string | null;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ─── Composed content shapes ─────────────────────────────────────────────────

export interface RunSummary {
  source: "job_runs" | "agent_task";
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
  queue: QueueStatRow[];
  runs_yesterday: RunSummary[];
  exceptions: ExceptionsSection;
  todays_three: TodaysThreeItem[];
  vitals?: VitalsSection;
}

export interface ComposeBriefInputs {
  briefDate: string;
  /** Reference instant for age-of-stale-task calculations. */
  now: Date;
  queue: QueueStatRow[];
  /** public.job_runs rows started during yesterday's Chicago day. */
  jobRuns: JobRunRow[];
  /** agent_tasks with task_type LIKE 'job:%' completed during yesterday's Chicago day. */
  jobTasks: AgentTaskRow[];
  /** agent_tasks with flagged_stale_at IS NOT NULL AND status = 'awaiting_review'. */
  staleTasks: AgentTaskRow[];
  /** agent_tasks with status = 'failed'. */
  failedTasks: AgentTaskRow[];
  /** agent_tasks with task_type = 'intake_error' AND status = 'awaiting_review'. */
  intakeErrorTasks: AgentTaskRow[];
  /** Top 3 awaiting_review agent_tasks ordered by priority, created_at. */
  todaysThreeTasks: AgentTaskRow[];
  /** get_marketplace_vitals() result, or null/undefined when the RPC is unavailable or errored. */
  vitalsCurrent?: Record<string, unknown> | null;
  /** The previous daily_briefs row's content.vitals.current, or null if none. */
  vitalsPrevious?: Record<string, unknown> | null;
}

/** Milliseconds between two ISO timestamps, or null if either is missing/invalid. */
function durationMs(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return end - start;
}

/** Numeric-only deltas (current - previous) for keys present as numbers in both objects. */
export function computeVitalsDeltas(
  current: Record<string, unknown> | null | undefined,
  previous: Record<string, unknown> | null | undefined,
): Record<string, number> | null {
  if (!current || !previous) return null;
  const deltas: Record<string, number> = {};
  for (const key of Object.keys(current)) {
    const c = current[key];
    const p = previous[key];
    if (typeof c === "number" && typeof p === "number" && !Number.isNaN(c) && !Number.isNaN(p)) {
      deltas[key] = c - p;
    }
  }
  return Object.keys(deltas).length > 0 ? deltas : null;
}

/**
 * Assemble the daily_briefs.content payload from already-fetched rows. Pure:
 * no DB, no clock reads beyond the `now` passed in — deterministic for a
 * given input, so it can be exercised with fixtures.
 */
export function composeBriefContent(inputs: ComposeBriefInputs): BriefContent {
  const runsFromJobs: RunSummary[] = inputs.jobRuns.map((r) => ({
    source: "job_runs",
    name: r.job_name,
    status: r.status,
    started_at: r.started_at,
    duration_ms: durationMs(r.started_at, r.finished_at),
    error: r.error,
    cost_usd: r.cost_usd,
  }));

  const runsFromTasks: RunSummary[] = inputs.jobTasks.map((t) => ({
    source: "agent_task",
    name: t.task_type,
    status: t.status,
    started_at: t.started_at,
    duration_ms: durationMs(t.started_at, t.completed_at),
    error: t.last_error,
    cost_usd: null,
  }));

  const runs_yesterday = [...runsFromJobs, ...runsFromTasks].sort((a, b) => {
    const at = a.started_at ? new Date(a.started_at).getTime() : 0;
    const bt = b.started_at ? new Date(b.started_at).getTime() : 0;
    return at - bt;
  });

  const nowMs = inputs.now.getTime();
  const stale: StaleException[] = inputs.staleTasks.map((t) => ({
    id: t.id,
    summary: t.summary,
    age_hours: t.flagged_stale_at
      ? Math.max(0, Math.round(((nowMs - new Date(t.flagged_stale_at).getTime()) / 3_600_000) * 10) / 10)
      : 0,
  }));

  const failed: FailedException[] = inputs.failedTasks.map((t) => ({
    id: t.id,
    summary: t.summary,
    last_error: t.last_error,
  }));

  const intake_errors: IntakeErrorException[] = inputs.intakeErrorTasks.map((t) => ({
    id: t.id,
    summary: t.summary,
  }));

  const todays_three: TodaysThreeItem[] = inputs.todaysThreeTasks.map((t) => ({
    id: t.id,
    summary: t.summary,
    priority: t.priority,
    assignee: t.assignee,
  }));

  const content: BriefContent = {
    brief_date: inputs.briefDate,
    queue: inputs.queue,
    runs_yesterday,
    exceptions: { stale, failed, intake_errors },
    todays_three,
  };

  if (inputs.vitalsCurrent) {
    content.vitals = {
      current: inputs.vitalsCurrent,
      previous: inputs.vitalsPrevious ?? null,
      deltas: computeVitalsDeltas(inputs.vitalsCurrent, inputs.vitalsPrevious),
    };
  }

  return content;
}
