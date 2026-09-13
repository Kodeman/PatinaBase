/**
 * Hooks for Project Time Tracking (public.project_time_entries, 00177).
 *
 * Wave 1 = manual entries + summaries. Wave 2 adds the running timer:
 * duration_minutes IS NULL = a running timer, one per user (partial unique
 * index — a duplicate INSERT raises SQLSTATE 23505). database.types.ts is not
 * regenerated yet, so the Supabase client is cast `as any` like the other
 * portal hooks (see use-projects.ts).
 *
 * This module moved here from apps/designer-portal/src/hooks (00595 wave) so
 * every surface that captures an hour — desk, ⌘K, mobile, Field drain — reads
 * one implementation. The document-coupled pieces (document-time-provider,
 * time-derivation, authority-hours) stay app-local.
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { normalizePhaseSlug, ALL_PHASE_SLUGS, type PhaseSlug } from '@patina/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Query keys ──
// Literal arrays that MIRROR designer-portal's queryKeys factory exactly
// (queryKeys.projects.all = ['projects'], queryKeys.time.all = ['time'], and
// runningTimer()'s trailing undefined is part of the key). The portal's other
// hooks read and invalidate the same arrays, so these literals are a contract,
// not a convenience — same house style as use-invoices.ts.
const timeKeys = {
  timeEntries: (projectId: string, filters?: unknown) =>
    filters
      ? (['projects', projectId, 'time-entries', filters] as const)
      : (['projects', projectId, 'time-entries'] as const),
  timeTracking: (projectId: string) => ['projects', projectId, 'time-tracking'] as const,
  unbilledTime: (projectId: string) => ['projects', projectId, 'unbilled-time'] as const,
  keyMetrics: (projectId: string) => ['projects', projectId, 'key-metrics'] as const,
  timeline: (projectId: string) => ['projects', projectId, 'timeline'] as const,
  all: ['time'] as const,
  runningTimer: () => ['time', 'running-timer', undefined] as const,
  // W2's three reads sit UNDER timeKeys.all ('time'), so invalidateProjectTime's
  // blanket invalidation refreshes the ledger, the studio rollup and the project
  // total after every write — one canonical key per read, no second family.
  ledger: (params: unknown) => ['time', 'ledger', params] as const,
  studioRollup: (params: unknown) => ['time', 'studio-rollup', params] as const,
  projectHoursTotal: (projectId: string | null) =>
    ['time', 'project-total', projectId] as const,
  // Three reads the document surface owned as inline literals before they
  // became hooks. The keys move here UNCHANGED: `useStampProjectPricingStudio`
  // invalidates ['document-hours-project-studio', projectId] by name, and the
  // Hours sheet's own week read sits beside it on ['document-hours-week'].
  // Renaming either would silently stop a resolved repair from refreshing the
  // line it repaired.
  projectPricingStudio: (projectId: string | null) =>
    ['document-hours-project-studio', projectId] as const,
  entryNote: (entryId: string) => ['document-hours-entry-note', entryId] as const,
  studioUnbilled: () => ['desk-contents-unbilled-time'] as const,
};

// ── Billing state (the server's verdict on an hour) ──
// Canonical here so this module does not reach into the portal; the portal's
// lib/document/authority-hours re-exports these three for its own callers.

export type TimeBillingState =
  | 'authorized'
  | 'pending_authorization'
  | 'nonbillable';

export interface InvoiceEligibleTimeEntry {
  billable?: boolean | null;
  invoice_id?: string | null;
  billing_state?: TimeBillingState | null;
}

/**
 * The server-authored billing state is decisive. A null state remains eligible
 * for pre-authority legacy entries so existing projects keep invoicing.
 */
export function isInvoiceEligibleTimeEntry(
  entry: InvoiceEligibleTimeEntry,
): boolean {
  if (entry.billable !== true || entry.invoice_id) return false;
  return entry.billing_state == null || entry.billing_state === 'authorized';
}

// ── Rolling report windows ──

export type StudioPeriod = 'week' | 'month' | 'quarter' | 'year';

/**
 * Inclusive lower bound (ISO timestamp) for a rolling report window ending
 * now. Mirrors the earnings page's rolling periods ("week" = last 7 days).
 */
export function studioPeriodStartISO(period: StudioPeriod, now: Date = new Date()): string {
  const start = new Date(now);
  if (period === 'week') start.setDate(now.getDate() - 7);
  else if (period === 'month') start.setMonth(now.getMonth() - 1);
  else if (period === 'quarter') start.setMonth(now.getMonth() - 3);
  else start.setFullYear(now.getFullYear() - 1);
  return start.toISOString();
}

// ── Types ──

/**
 * 00600: which leg of resolve_time_rate_cents (00599) priced an hour.
 * 'profile_default' is reserved by the CHECK and has no writer (HT-2 unruled).
 * NULL on any row written before 00600 — a legacy snapshot of unknown
 * provenance, which is NOT the same as 'none' ("rate pending", HT-26).
 */
export type TimeRateSource = 'authority' | 'studio_member' | 'profile_default' | 'none';

/** HT-41: the roster role that priced the hour. 'client' is deliberately out. */
export type TimeRateRole = 'lead_designer' | 'support_designer' | 'bookkeeper' | 'vendor';

export interface ProjectTimeEntry {
  id: string;
  project_id: string;
  phase_key: string | null;
  task_id: string | null;
  user_id: string;
  started_at: string;
  duration_minutes: number;
  notes: string | null;
  billable: boolean;
  /** R4 (00198) — what the work was. NULL is "activity not set" (HT-24). */
  activity?: string | null;
  /** R4 (00198)/00595 — which capture surface wrote the hour. */
  source?: string;
  hourly_rate_cents: number | null;
  billing_authority_id?: string | null;
  authority_rate_id?: string | null;
  billing_state?: TimeBillingState | null;
  rated_amount_cents?: number | null;
  /** 00600, server-owned on every branch (HT-1). A supplied value raises. */
  rate_source?: TimeRateSource | null;
  /** 00600 (HT-41). Caller-suppliable on INSERT, validated server-side. */
  rate_role?: TimeRateRole | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
  profile?: { full_name: string | null } | null;
}

export interface TimeEntryFilters {
  userId?: string;
  phaseKey?: string;
  billable?: boolean;
  /** true = only invoiced, false = only un-invoiced, undefined = all */
  invoiced?: boolean;
  /** ISO timestamp lower bound on started_at (inclusive) */
  from?: string;
  /** ISO timestamp upper bound on started_at (inclusive) */
  to?: string;
}

export interface UnbilledTimeRow {
  id: string;
  project_id: string;
  phase_key: string | null;
  task_id: string | null;
  user_id: string;
  started_at: string;
  duration_minutes: number;
  notes: string | null;
  resolved_rate_cents: number;
  amount_cents: number;
  billing_authority_id?: string | null;
  authority_rate_id?: string | null;
  billing_state?: TimeBillingState | null;
  rated_amount_cents?: number | null;
}

export interface UnbilledTimeSummary {
  entries: UnbilledTimeRow[];
  totalMinutes: number;
  totalAmountCents: number;
}

export function filterProjectUnbilledEntries<
  T extends {
    project_id: string;
    billing_state?: TimeBillingState | null;
  },
>(rows: readonly T[], projectId: string): T[] {
  return rows.filter(
    (entry) =>
      entry.project_id === projectId &&
      isInvoiceEligibleTimeEntry({
        billable: true,
        invoice_id: null,
        billing_state: entry.billing_state,
      }),
  );
}

// ── Cache invalidation ──

// Every time-entry write must refresh the project's entry list, the summary
// panel, the unbilled rollup, and key metrics (hoursSpent).
function invalidateProjectTime(queryClient: QueryClient, projectId: string) {
  queryClient.invalidateQueries({ queryKey: timeKeys.timeEntries(projectId) });
  queryClient.invalidateQueries({ queryKey: timeKeys.timeTracking(projectId) });
  queryClient.invalidateQueries({ queryKey: timeKeys.unbilledTime(projectId) });
  queryClient.invalidateQueries({ queryKey: timeKeys.keyMetrics(projectId) });
  queryClient.invalidateQueries({ queryKey: timeKeys.all });
  // The Desk's one act-bearing line reads its own cross-project key, which sits
  // outside `timeKeys.all` because it predates the module's 'time' family. With
  // a five-minute staleTime and no refetch on focus, a billed-out studio kept
  // being offered "hours to bill →" and the click handed the composer entry ids
  // an invoice already claimed.
  queryClient.invalidateQueries({ queryKey: timeKeys.studioUnbilled() });
}

// ── Queries ──

/** Unbilled rollup from the project_unbilled_time view (00177). */
export function useUnbilledTime(projectId: string | null) {
  return useQuery({
    queryKey: projectId
      ? timeKeys.unbilledTime(projectId)
      : ['projects', 'unbilled-time', 'null'],
    queryFn: async (): Promise<UnbilledTimeSummary> => {
      if (!projectId) throw new Error('Project ID required');
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_unbilled_time')
        .select('*')
        .eq('project_id', projectId)
        .order('started_at', { ascending: false });
      if (error) throw error;
      // The view is expected to be server-filtered. Keep the portal defensive:
      // pending cap/retainer time and explicit nonbillable time must never be
      // selectable even if a stale view briefly returns them. Null preserves
      // compatibility with entries created before billing authorities existed.
      const entries = filterProjectUnbilledEntries(
        (data ?? []) as UnbilledTimeRow[],
        projectId,
      )
        .map((entry) => ({
          ...entry,
          // New authority-aware rows carry the immutable rated snapshot.
          // The legacy view aliases remain the compatibility fallback.
          resolved_rate_cents:
            entry.resolved_rate_cents ?? 0,
          amount_cents: entry.rated_amount_cents ?? entry.amount_cents ?? 0,
        }));
      return {
        entries,
        totalMinutes: entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
        totalAmountCents: entries.reduce((sum, e) => sum + (e.amount_cents || 0), 0),
      };
    },
    enabled: !!projectId,
  });
}

/** A row of project_unbilled_time as the Desk's one act-bearing line reads it. */
export interface StudioUnbilledTimeRow {
  id: string;
  project_id: string;
  billing_state?: TimeBillingState | null;
}

/**
 * HT-29 — every unbilled, invoice-eligible hour this caller can read, across
 * every document, with no project filter: RLS is the scope and this hook names
 * none. Three columns only, because the Desk's line is an act or nothing (R95
 * keeps counts and metrics off that index) — never a money total, and never
 * `notes` (HT-36).
 */
export function useStudioUnbilledTime() {
  return useQuery({
    queryKey: timeKeys.studioUnbilled(),
    queryFn: async (): Promise<StudioUnbilledTimeRow[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_unbilled_time')
        .select('id, project_id, billing_state');
      if (error) throw error;
      return ((data ?? []) as StudioUnbilledTimeRow[]).filter((row) =>
        isInvoiceEligibleTimeEntry({
          billable: true,
          invoice_id: null,
          billing_state: row.billing_state,
        }),
      );
    },
  });
}

/** One phase's spent-vs-estimated hours (designer-portal's TimeEntry UI shape). */
export interface TimePhaseSummary {
  phase: PhaseSlug;
  hoursSpent: number;
  hoursEstimated: number;
}

/** Structurally the portal's MockTimeTracking, stated here so the data layer
 *  does not import a portal UI type. */
export interface ProjectTimeSummary {
  entries: TimePhaseSummary[];
  totalSpent: number;
  totalEstimated: number;
  effectiveRate: number;
}

/**
 * Shared summary fetch — spent vs estimated hours per phase, shaped to the
 * ProjectTimeSummary contract TimeTrackingPanel renders. Also used by
 * useProjectTimeTracking (use-projects.ts) for real (UUID) projects.
 *
 * effectiveRate is left 0 — the panel derives the effective $/hr from
 * designFee / totalSpent itself (matching the pre-existing behavior).
 */
export async function fetchTimeSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string
): Promise<ProjectTimeSummary> {
  const [entriesRes, phasesRes] = await Promise.all([
    supabase
      .from('project_time_entries')
      .select('phase_key, duration_minutes')
      .eq('project_id', projectId)
      .not('duration_minutes', 'is', null),
    supabase
      .from('project_phases')
      .select('phase_key, estimated_hours, sort_order')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true }),
  ]);
  if (entriesRes.error) throw entriesRes.error;
  if (phasesRes.error) throw phasesRes.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (entriesRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phases = (phasesRes.data ?? []) as any[];

  // Aggregate per canonical slug. Phase order follows project_phases
  // sort_order; slugs that only appear on entries append in canonical order.
  const order: PhaseSlug[] = [];
  const byPhase = new Map<PhaseSlug, { spentMinutes: number; estimated: number }>();
  const ensure = (slug: PhaseSlug) => {
    let agg = byPhase.get(slug);
    if (!agg) {
      agg = { spentMinutes: 0, estimated: 0 };
      byPhase.set(slug, agg);
      order.push(slug);
    }
    return agg;
  };

  for (const p of phases) {
    const slug = normalizePhaseSlug(p.phase_key);
    ensure(slug).estimated += Number(p.estimated_hours) || 0;
  }
  // Pre-aggregate entry minutes so slugs with logged time but no phase row
  // append in canonical order (not arbitrary entry order).
  const spentBySlug = new Map<PhaseSlug, number>();
  for (const e of entries) {
    const slug = normalizePhaseSlug(e.phase_key);
    spentBySlug.set(slug, (spentBySlug.get(slug) ?? 0) + (e.duration_minutes || 0));
  }
  for (const slug of ALL_PHASE_SLUGS) {
    const minutes = spentBySlug.get(slug);
    if (minutes !== undefined) ensure(slug).spentMinutes += minutes;
  }

  const summaryEntries: TimePhaseSummary[] = order.map((slug) => {
    const agg = byPhase.get(slug)!;
    return {
      phase: slug,
      hoursSpent: round1(agg.spentMinutes / 60),
      hoursEstimated: round1(agg.estimated),
    };
  });

  return {
    entries: summaryEntries,
    totalSpent: round1(summaryEntries.reduce((sum, e) => sum + e.hoursSpent, 0)),
    totalEstimated: round1(summaryEntries.reduce((sum, e) => sum + e.hoursEstimated, 0)),
    effectiveRate: 0,
  };
}

// ── Mutations (manual entries) ──

/**
 * The capture surfaces this package can write from. W0's `00595` bought the
 * whole DB vocabulary at once; the union widens one wave at a time as each
 * surface lands — `command_bar` is W3's ⌘K verb, `field_manual` is W6's
 * Patina Field sheet. (W4 adds `internal`.)
 */
export type TimeEntrySource =
  | 'timer_auto'
  | 'timer_manual'
  | 'manual_entry'
  | 'command_bar'
  | 'field_manual';

/** A uuid the CALLER mints, so `log_time`'s ON CONFLICT can recognise a replay. */
function mintEntryId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Test environments and very old browsers. Collision-safe enough for an id
  // whose only job is to make one retry idempotent.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface CreateTimeEntryInput {
  /** 00608 — the id this write is made under. Omitted, the hook mints one; a
   *  surface that may retry (an offline drain) mints its own and keeps it. */
  entryId?: string;
  projectId: string;
  durationMinutes: number;
  startedAt?: string;
  phaseKey?: string | null;
  taskId?: string | null;
  notes?: string | null;
  /**
   * HT-11 — REQUIRED. The implicit `?? true` is gone: every capture surface
   * carries the control, and `log_time` raises on a missing value rather than
   * guessing one. Seed it from the resolved answer
   * (`automaticTimeBillingIntent`), never from optimism.
   */
  billable: boolean;
  /** R4 (00198): activity attribution + entry provenance. Optional — old
   *  callers keep the DB defaults ('timer_manual', activity NULL). */
  activity?: string | null;
  source?: TimeEntrySource;
  /** HT-41 (00600/00601): the role pick, shown only when the member holds more
   *  than one on the project. The server raises on a role they do not hold, and
   *  derives one when this is omitted. No rate is ever sent — the server owns
   *  it on every project kind (HT-1). */
  rateRole?: TimeRateRole | null;
}

export function useCreateTimeEntry(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    // R83 — document surfaces render failures inline; no global toast.
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async (input: CreateTimeEntryInput) => {
      const supabase = getSupabase();
      // 00608 — `log_time`, not a bare insert. The id is minted here so a
      // retried call re-reads the hour it already wrote instead of writing a
      // second one; `user_id` is `auth.uid()` server-side, so it is not sent.
      //
      // No hourly_rate_cents, rated_amount_cents, billing_state or rate_source
      // is ever sent: HT-1 makes them server-owned, and 00600's guard REJECTS a
      // supplied rate_source or rated_amount_cents outright. Pinned by
      // apps/designer-portal/src/hooks/__tests__/use-time-tracking-authority.test.tsx.
      const { data, error } = await supabase.rpc('log_time', {
        p_entry_id: input.entryId ?? mintEntryId(),
        p_project_id: input.projectId,
        p_started_at: input.startedAt ?? new Date().toISOString(),
        p_duration_minutes: input.durationMinutes,
        p_activity: input.activity ?? null,
        p_billable: input.billable,
        p_notes: input.notes ?? null,
        p_phase_key: input.phaseKey ?? null,
        p_task_id: input.taskId ?? null,
        p_source: input.source ?? 'manual_entry',
        p_rate_role: input.rateRole ?? null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as ProjectTimeEntry;
    },
    onSuccess: (_, { projectId }) => invalidateProjectTime(queryClient, projectId),
  });
}

export interface UpdateTimeEntryInput {
  id: string;
  projectId: string;
  updates: Partial<{
    started_at: string;
    duration_minutes: number;
    phase_key: string | null;
    task_id: string | null;
    notes: string | null;
    billable: boolean;
    /** R4 (00198) */
    activity: string | null;
  }>;
}

export function useUpdateTimeEntry(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    // R83 — see useCreateTimeEntry.
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({ id, updates }: UpdateTimeEntryInput) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_time_entries')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ProjectTimeEntry;
    },
    onSuccess: (_, { projectId }) => invalidateProjectTime(queryClient, projectId),
  });
}

export function useDeleteTimeEntry(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    // R83 — see useCreateTimeEntry. (R77: the Hours ledger deletes unbilled
    // entries with an inline confirm; billed entries stay immutable.)
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase.from('project_time_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { projectId }) => invalidateProjectTime(queryClient, projectId),
  });
}

// ── Running timer (Wave 2) ──
// duration_minutes IS NULL marks the (single, per-user) running row. The chip
// ticks client-side from started_at, so no refetchInterval here.

export interface RunningTimer {
  id: string;
  project_id: string;
  phase_key: string | null;
  task_id: string | null;
  user_id: string;
  started_at: string;
  notes: string | null;
  billable: boolean;
  project?: { name: string | null; current_phase: string | null } | null;
}

/** The signed-in user's running timer, or null. */
export function useRunningTimer() {
  return useQuery({
    queryKey: timeKeys.runningTimer(),
    queryFn: async (): Promise<RunningTimer | null> => {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return null;

      const { data, error } = await supabase
        .from('project_time_entries')
        .select('*, project:projects(name, current_phase)')
        .is('duration_minutes', null)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as RunningTimer | null;
    },
    staleTime: 30_000,
  });
}

export interface StartTimerInput {
  projectId: string;
  phaseKey?: string | null;
  taskId?: string | null;
  /** R4 (00198): 'timer_auto' = the document spine's pick-up timer (D11).
   *  Omitted = 'timer_auto' (the only caller today is the document spine). */
  source?: 'timer_auto' | 'timer_manual';
  /**
   * HT-11 — REQUIRED, same rule as `CreateTimeEntryInput.billable`. The
   * intent is resolved (`automaticTimeBillingIntent`) and stated; `start_timer`
   * raises on a missing value rather than letting 00177's `DEFAULT true` price
   * an hour nobody decided about. Authority IDs, rate snapshots, billing_state
   * and rated amounts stay the database's.
   */
  billable: boolean;
}

/**
 * What `start_timer` (00608) hands back: the slot it opened, and the hour it
 * had to chain out to open it — so the caller can still raise the log-offer
 * strip for that hour (R20/§0.22). `stopped` is null when the slot was free.
 */
export interface StartTimerResult {
  started: RunningTimer;
  stopped: ProjectTimeEntry | null;
}

/**
 * Take the one running-timer slot. 00608 made this atomic: the RPC stops the
 * incumbent and opens the new row in one transaction, so the SQLSTATE 23505
 * branch this hook used to carry is gone — along with the `quiet` flag and the
 * injected toast that gated it. (Nothing was ever reported through them: the
 * shipped call site passed `quiet: true`, and the `(document)` route group
 * mounts no ToastProvider by R83, so `useToast()` returned a truthy no-op.)
 * A real failure now surfaces the way every other document mutation's does —
 * through the mutation's own error, inline at the act site.
 */
export function useStartTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: StartTimerInput): Promise<StartTimerResult> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('start_timer', {
        p_project_id: input.projectId,
        p_source: input.source ?? 'timer_auto',
        p_billable: input.billable,
        p_phase_key: input.phaseKey ?? null,
        p_task_id: input.taskId ?? null,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        | { started: RunningTimer; stopped: ProjectTimeEntry | null }
        | undefined;
      if (!row?.started) throw new Error('The timer did not start. Try again.');
      return { started: row.started, stopped: row.stopped ?? null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timeKeys.runningTimer() });
    },
  });
}

export interface StopTimerInput {
  entryId: string;
  notes?: string | null;
  phaseKey?: string | null;
  billable?: boolean;
  /** R4 (00198) — the document close-out: an explicit duration (the
   *  source-following rule computes it; D10 lets the designer adjust it
   *  afterwards), the raw elapsed truth, and the activity attribution.
   *  All optional — the header stop dialog keeps its shipped behavior. */
  durationMinutesOverride?: number;
  rawSeconds?: number | null;
  /** D10 idle annotation (00198) — never subtracted from duration. */
  idleSeconds?: number | null;
  activity?: string | null;
}

/** Stop a running timer. The database snapshots authority/rate provenance,
 * classifies the entry, and rates its amount; the portal only records time. */
export function useStopTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: StopTimerInput) => {
      const supabase = getSupabase();

      // Re-read the row — started_at/project_id from the server, not the cache.
      const { data: entry, error: entryError } = await supabase
        .from('project_time_entries')
        .select('id, project_id, user_id, started_at, duration_minutes')
        .eq('id', input.entryId)
        .maybeSingle();
      if (entryError) throw entryError;
      if (!entry) throw new Error('Timer not found — it may have been discarded elsewhere.');
      if (entry.duration_minutes !== null) throw new Error('This timer was already stopped.');

      const elapsedSeconds = Math.max(0, (Date.now() - new Date(entry.started_at).getTime()) / 1000);
      const durationMinutes =
        input.durationMinutesOverride ?? Math.max(1, Math.round(elapsedSeconds / 60));

      const updates: Record<string, unknown> = {
        duration_minutes: durationMinutes,
      };
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.phaseKey !== undefined) updates.phase_key = input.phaseKey;
      if (input.billable !== undefined) updates.billable = input.billable;
      if (input.rawSeconds !== undefined) updates.raw_seconds = input.rawSeconds;
      if (input.idleSeconds !== undefined) updates.idle_seconds = input.idleSeconds;
      if (input.activity !== undefined) updates.activity = input.activity;

      const { data, error } = await supabase
        .from('project_time_entries')
        .update(updates)
        .eq('id', input.entryId)
        .select()
        .single();
      if (error) throw error;
      return data as ProjectTimeEntry;
    },
    onSuccess: (entry) => {
      // invalidateProjectTime covers timeKeys.all (→ runningTimer) too.
      invalidateProjectTime(queryClient, entry.project_id);
    },
  });
}

/** Discard the running timer — delete the row, log nothing. */
export function useDiscardTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ entryId }: { entryId: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('project_time_entries')
        .delete()
        .eq('id', entryId)
        .is('duration_minutes', null); // never delete a completed entry by accident
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timeKeys.runningTimer() });
    },
  });
}

// ── Invoice claim (kind='time' pull-through, 00178) ──
// "Claiming" stamps invoice_id on unbilled entries when the composer creates
// a draft carrying a time line; once stamped, the 00177 guard trigger locks
// the entries' priced columns. Releasing is the void_invoice RPC's job,
// server-side — no client hook nulls invoice_id any more.

export interface ClaimTimeEntriesInput {
  invoiceId: string;
  projectId: string;
  entryIds: string[];
}

/**
 * Atomic claim (00595). `claim_time_entries` stamps, in ONE statement, only the
 * rows still unbilled, billable and authorized, and returns the ids it actually
 * claimed. Fewer ids back than asked for means another invoice won the race:
 * the mutation throws and the caller compensates by deleting its draft. There
 * is deliberately NO compensating UPDATE here — the one that shipped detached
 * every entry the invoice already carried.
 */
export function useClaimTimeEntries(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    // R83 — the invoice composer renders claim conflicts inline.
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({ invoiceId, entryIds }: ClaimTimeEntriesInput) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('claim_time_entries', {
        p_invoice_id: invoiceId,
        p_entry_ids: entryIds,
      });
      if (error) throw error;

      const claimed = ((data ?? []) as string[]);
      if (claimed.length !== entryIds.length) {
        throw new Error(
          'Some of the selected time entries were just billed on another invoice. Refresh and try again.'
        );
      }
      return claimed;
    },
    onSuccess: (_ids, { projectId }) => {
      invalidateProjectTime(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

// ── The four scopes (W2: 00604 view + 00607 rollups) ──
//
// HT-37 (ruled): `useStudioTimeReport` is DELETED, not wired. It pulled every
// studio entry plus the whole unbilled view into the browser and grouped them
// there; the per-member group-by is `studio_hours_rollup` (00607) now, and the
// rows come from `time_entry_ledger` (00604). Both are SECURITY INVOKER, so RLS
// (as narrowed by 00606) is the scope — these hooks pass no secret and enforce
// nothing the server does not.

/** A row of public.time_entry_ledger (00604). No `notes`: HT-36. */
export interface TimeEntryLedgerRow {
  id: string;
  project_id: string;
  project_name: string | null;
  /** The studio that PRICES this project's hours (HT-3-a/b). Never a policy key. */
  studio_id: string | null;
  user_id: string;
  member_name: string | null;
  phase_key: string | null;
  task_id: string | null;
  started_at: string;
  /** UTC buckets, matching the resolver's own date basis. */
  day: string;
  iso_week: string;
  month: string;
  duration_minutes: number | null;
  is_running: boolean;
  billable: boolean;
  activity: string | null;
  source: string;
  billing_state?: TimeBillingState | null;
  rate_source?: TimeRateSource | null;
  rate_role?: TimeRateRole | null;
  resolved_rate_cents: number;
  amount_cents: number;
  invoice_id: string | null;
  billing_authority_id?: string | null;
  authority_rate_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryLedgerParams {
  /** The studio scope. Omit for "every studio this caller can read". */
  studioId?: string | null;
  /** The member scope. */
  userId?: string | null;
  /** The project scope. */
  projectId?: string | null;
  /** Inclusive ISO date bounds on the UTC day bucket. */
  from?: string | null;
  to?: string | null;
  /** Running timers are included by default — the sheet shows them as rows. */
  includeRunning?: boolean;
  limit?: number;
}

/** Rows for any of the four scopes (00604). RLS decides what comes back. */
export function useTimeEntryLedger(params: TimeEntryLedgerParams = {}) {
  const { studioId, userId, projectId, from, to, includeRunning = true, limit } = params;

  return useQuery({
    queryKey: timeKeys.ledger(params),
    // With no filter at all this selects the whole fact view for the window —
    // every row RLS lets the caller read. A scope always names at least one of
    // the three; nothing else may ask.
    enabled: Boolean(studioId || userId || projectId),
    queryFn: async (): Promise<TimeEntryLedgerRow[]> => {
      const supabase = getSupabase();
      let query = supabase
        .from('time_entry_ledger')
        .select('*')
        .order('started_at', { ascending: false });

      if (studioId) query = query.eq('studio_id', studioId);
      if (userId) query = query.eq('user_id', userId);
      if (projectId) query = query.eq('project_id', projectId);
      if (from) query = query.gte('day', from);
      if (to) query = query.lte('day', to);
      if (!includeRunning) query = query.eq('is_running', false);
      if (limit) query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TimeEntryLedgerRow[];
    },
  });
}

/** The five buckets public.studio_hours_rollup accepts; a sixth raises. */
export type TimeHoursGroupBy = 'member' | 'project' | 'day' | 'iso_week' | 'activity';

export interface StudioHoursRollupParams {
  studioId: string | null;
  /** Inclusive ISO date bounds. */
  from: string;
  to: string;
  groupBy?: TimeHoursGroupBy;
  /** The member scope. */
  userId?: string | null;
  /** The project scope. */
  projectId?: string | null;
}

/** A bucket of public.studio_hours_rollup (00607). Never carries notes (HT-36). */
export interface StudioHoursRollupRow {
  bucket_key: string;
  bucket_label: string;
  member_id: string | null;
  member_name: string | null;
  entry_count: number;
  total_minutes: number;
  billable_minutes: number;
  billable_cents: number;
  internal_minutes: number;
}

/**
 * Aggregates for the member / project / studio scopes (00607, SECURITY INVOKER).
 * Running timers are excluded server-side: a total never counts an unfinished
 * hour.
 */
export function useStudioHoursRollup(params: StudioHoursRollupParams) {
  const { studioId, from, to, groupBy = 'member', userId = null, projectId = null } = params;

  return useQuery({
    queryKey: timeKeys.studioRollup(params),
    enabled: Boolean(studioId),
    queryFn: async (): Promise<StudioHoursRollupRow[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('studio_hours_rollup', {
        p_studio_id: studioId,
        p_from: from,
        p_to: to,
        p_group_by: groupBy,
        p_user_id: userId,
        p_project_id: projectId,
      });
      if (error) throw error;
      return (data ?? []) as StudioHoursRollupRow[];
    },
  });
}

/** public.project_hours_total's return shape (00607). Minutes and money only. */
export interface ProjectHoursTotal {
  minutes: number;
  billable_minutes: number;
  amount_cents: number;
}

/**
 * HT-10-a: the project total a member keeps after 00606 narrowed her per-row
 * read to her own rows. SECURITY DEFINER server-side, with the standing assert
 * first — it throws for a caller who is not on the project, so the project lens
 * must surface that rather than rendering a zero.
 */
export function useProjectHoursTotal(projectId: string | null) {
  return useQuery({
    queryKey: timeKeys.projectHoursTotal(projectId),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ProjectHoursTotal> => {
      if (!projectId) throw new Error('Project ID required');
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('project_hours_total', {
        p_project_id: projectId,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as ProjectHoursTotal | undefined;
      return row ?? { minutes: 0, billable_minutes: 0, amount_cents: 0 };
    },
  });
}

/**
 * The studio that PRICES a document's hours (`projects.studio_id`, HT-3-a/b) —
 * read off the DOCUMENT, never off one person's entries. The Hours sheet's week
 * read is `.eq('user_id', …)`, so HT-9's own case (an owner reading a house she
 * has logged nothing on) would find nothing and print "no studio yet" over a
 * document that names one, under a stamp door the server then refuses.
 *
 * `null` = the document names no studio (HT-3-g's repair applies). The caller
 * must keep `undefined` (not answered yet) distinct from that: they are not the
 * same fact and only one of them may print a sentence.
 */
export function useProjectPricingStudio(projectId: string | null) {
  return useQuery({
    queryKey: timeKeys.projectPricingStudio(projectId),
    enabled: projectId != null,
    queryFn: async (): Promise<string | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('projects')
        .select('studio_id')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw error;
      return (data?.studio_id as string | null) ?? null;
    },
  });
}

/**
 * HT-36 — one entry's free text, from the table, by an explicit act, one entry
 * at a time. `notes` is never a column of the rollup (00607) or of the fact
 * view (00604), so this is the only way a note is ever read; a refusal from RLS
 * is the answer, and the caller prints it as one.
 */
export function useTimeEntryNote(entryId: string) {
  return useQuery({
    queryKey: timeKeys.entryNote(entryId),
    queryFn: async (): Promise<string | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_time_entries')
        .select('notes')
        .eq('id', entryId)
        .maybeSingle();
      if (error) throw error;
      return (data?.notes as string | null) ?? null;
    },
  });
}

/**
 * HT-3-g's repair act (`stamp_project_pricing_studio`, 00606): names the studio
 * that prices a legacy project's hours, where `projects.studio_id` is NULL and
 * every hour on it therefore resolves `rate_source = 'none'` ("rate pending").
 *
 * The server admits only an owner or admin of the studio being named, and only
 * where that studio employs the project's designer; a stamped column is final.
 * So this hook sends the act and surfaces the refusal — it never pre-judges
 * standing, and the caller prints the server's words.
 */
export function useStampProjectPricingStudio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      studioId,
    }: {
      projectId: string;
      studioId: string;
    }): Promise<string | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('stamp_project_pricing_studio', {
        p_project_id: projectId,
        p_studio_id: studioId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    onSuccess: (_studioId, { projectId }) => {
      // The pricing studio is a column every hours read resolves through, and
      // it prices only hours logged AFTER the stamp (P-4 — no backfill).
      invalidateProjectTime(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['document-hours-week'] });
      // The Hours sheet reads the stamped column off the DOCUMENT, on its own
      // key — not off the week's entries. Left out, a SUCCESSFUL repair kept
      // printing "no studio yet" under a door the server then refused as
      // already-named, so the repair visibly failed to repair.
      queryClient.invalidateQueries({
        queryKey: ['document-hours-project-studio', projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['document-hours-pending-authorization'],
      });
    },
  });
}

// ── Capture inputs (W3: the ⌘K verb, the add row, the strip, the phone) ──

/**
 * Every document a studio member may log an hour against, by name. NOT
 * restricted to the projects she is rostered to: HT-25 seats her as a support
 * designer on first log (00597), so a roster seat is an OUTCOME of capture, not
 * its precondition. RLS is the only scope.
 *
 * Shares `['document-hours-projects']` with the Hours sheet's own selector
 * deliberately — one canonical key, one fetch, two readers.
 */
export interface TimeCaptureProject {
  id: string;
  name: string | null;
  status: string | null;
}

export function useTimeCaptureProjects() {
  return useQuery({
    queryKey: ['document-hours-projects'] as const,
    queryFn: async (): Promise<TimeCaptureProject[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status')
        .order('name');
      if (error) throw error;
      return (data ?? []) as TimeCaptureProject[];
    },
  });
}

/** The four roles a rate card can price. `client`/`previous_lead` never do. */
const RATE_ROLES: readonly TimeRateRole[] = [
  'lead_designer',
  'support_designer',
  'bookkeeper',
  'vendor',
];

/**
 * HT-41 — the viewer's LIVE roster roles on one document, filtered to the four
 * a rate card can price. The role chip appears only when this returns more than
 * one: with a single role the server derives it and asking would be a tap that
 * decides nothing.
 *
 * The project's own designer is fixed at `lead_designer` above any pick
 * (00599/00601), so she never gets a chip whatever seats she also holds.
 */
export function useMyRateRoles(projectId: string | null) {
  return useQuery({
    queryKey: ['time', 'my-rate-roles', projectId] as const,
    enabled: Boolean(projectId),
    queryFn: async (): Promise<TimeRateRole[]> => {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return [];

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('designer_id')
        .eq('id', projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      if (project?.designer_id === userId) return ['lead_designer'];

      const { data, error } = await supabase
        .from('project_team_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .is('removed_at', null);
      if (error) throw error;
      const held = new Set(
        ((data ?? []) as { role: string }[]).map((row) => row.role),
      );
      return RATE_ROLES.filter((role) => held.has(role));
    },
  });
}

// ── Phase estimates (project_phases.estimated_hours, 00177) ──

/** Batch-save per-phase hour estimates from the project edit page. */
export function useUpdatePhaseEstimates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      changes,
    }: {
      projectId: string;
      changes: Array<{ phaseId: string; estimatedHours: number | null }>;
    }) => {
      const supabase = getSupabase();
      for (const change of changes) {
        const { error } = await supabase
          .from('project_phases')
          .update({ estimated_hours: change.estimatedHours })
          .eq('id', change.phaseId);
        if (error) throw error;
      }
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: timeKeys.timeTracking(projectId) });
      queryClient.invalidateQueries({ queryKey: timeKeys.timeline(projectId) });
      queryClient.invalidateQueries({ queryKey: timeKeys.keyMetrics(projectId) });
    },
  });
}
