/**
 * Hooks for Project Time Tracking (public.project_time_entries, 00177).
 *
 * Wave 1 = manual entries + summaries. Running-timer hooks land in a later
 * wave (the table already supports them: duration_minutes IS NULL = running,
 * one per user). database.types.ts is not regenerated yet, so the Supabase
 * client is cast `as any` like the other portal hooks (see use-projects.ts).
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { normalizePhaseSlug, ALL_PHASE_SLUGS, type PhaseSlug } from '@patina/types';
import { queryKeys } from '@/lib/react-query';
import type { MockTimeTracking, TimeEntry as TimeSummaryEntry } from '@/types/project-ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Types ──

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
  hourly_rate_cents: number | null;
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
}

export interface UnbilledTimeSummary {
  entries: UnbilledTimeRow[];
  totalMinutes: number;
  totalAmountCents: number;
}

// ── Cache invalidation ──

// Every time-entry write must refresh the project's entry list, the summary
// panel, the unbilled rollup, and key metrics (hoursSpent).
function invalidateProjectTime(queryClient: QueryClient, projectId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.timeEntries(projectId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.timeTracking(projectId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.unbilledTime(projectId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.keyMetrics(projectId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.time.all });
}

// ── Queries ──

/** Completed entries (running timers excluded), newest first. */
export function useTimeEntries(projectId: string | null, filters?: TimeEntryFilters) {
  return useQuery({
    queryKey: projectId
      ? queryKeys.projects.timeEntries(projectId, filters)
      : ['projects', 'time-entries', 'null'],
    queryFn: async (): Promise<ProjectTimeEntry[]> => {
      if (!projectId) throw new Error('Project ID required');
      const supabase = getSupabase();
      let query = supabase
        .from('project_time_entries')
        .select('*, profile:profiles!project_time_entries_user_id_fkey(full_name)')
        .eq('project_id', projectId)
        .not('duration_minutes', 'is', null)
        .order('started_at', { ascending: false });

      if (filters?.userId) query = query.eq('user_id', filters.userId);
      if (filters?.phaseKey) query = query.eq('phase_key', filters.phaseKey);
      if (filters?.billable !== undefined) query = query.eq('billable', filters.billable);
      if (filters?.invoiced === true) query = query.not('invoice_id', 'is', null);
      if (filters?.invoiced === false) query = query.is('invoice_id', null);
      if (filters?.from) query = query.gte('started_at', filters.from);
      if (filters?.to) query = query.lte('started_at', filters.to);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ProjectTimeEntry[];
    },
    enabled: !!projectId,
  });
}

/** Unbilled rollup from the project_unbilled_time view (00177). */
export function useUnbilledTime(projectId: string | null) {
  return useQuery({
    queryKey: projectId
      ? queryKeys.projects.unbilledTime(projectId)
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
      const entries = (data ?? []) as UnbilledTimeRow[];
      return {
        entries,
        totalMinutes: entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
        totalAmountCents: entries.reduce((sum, e) => sum + (e.amount_cents || 0), 0),
      };
    },
    enabled: !!projectId,
  });
}

/**
 * Shared summary fetch — spent vs estimated hours per phase, shaped to the
 * MockTimeTracking contract TimeTrackingPanel renders. Also used by
 * useProjectTimeTracking (use-projects.ts) for real (UUID) projects.
 *
 * effectiveRate is left 0 — the panel derives the effective $/hr from
 * designFee / totalSpent itself (matching the pre-existing behavior).
 */
export async function fetchTimeSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string
): Promise<MockTimeTracking> {
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

  const summaryEntries: TimeSummaryEntry[] = order.map((slug) => {
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

/** Per-phase spent vs estimated summary (UUID projects). */
export function useTimeSummary(projectId: string | null) {
  return useQuery({
    queryKey: projectId
      ? queryKeys.projects.timeTracking(projectId)
      : ['projects', 'time-tracking', 'null'],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');
      return fetchTimeSummary(getSupabase(), projectId);
    },
    enabled: !!projectId,
  });
}

// ── Mutations (manual entries) ──

export interface CreateTimeEntryInput {
  projectId: string;
  durationMinutes: number;
  startedAt?: string;
  phaseKey?: string | null;
  taskId?: string | null;
  notes?: string | null;
  billable?: boolean;
  hourlyRateCents?: number | null;
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTimeEntryInput) => {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Not signed in');

      const { data, error } = await supabase
        .from('project_time_entries')
        .insert({
          project_id: input.projectId,
          user_id: userId,
          duration_minutes: input.durationMinutes,
          started_at: input.startedAt ?? new Date().toISOString(),
          phase_key: input.phaseKey ?? null,
          task_id: input.taskId ?? null,
          notes: input.notes ?? null,
          billable: input.billable ?? true,
          hourly_rate_cents: input.hourlyRateCents ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ProjectTimeEntry;
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
    hourly_rate_cents: number | null;
  }>;
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
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

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase.from('project_time_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { projectId }) => invalidateProjectTime(queryClient, projectId),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.timeTracking(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.timeline(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.keyMetrics(projectId) });
    },
  });
}
