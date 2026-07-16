import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Tables } from '../database.types';
import { useProjectPhases } from './use-project-v2';
import {
  resolveSchedule,
  type SchedulePhaseInput,
  type ScheduleMilestoneInput,
  type ResolvedSchedule,
  type PhaseStatus,
  type MilestoneKind,
  type MilestoneStatus,
} from '@patina/utils';

// ═══════════════════════════════════════════════════════════════════════════
// The Document · Schedule (C4) — read-only data layer for the Spine (R99/R100).
//
// migration 00323 is purely additive: project_phases gains chain columns
// (duration_days/follows_phase_id/anchor_date/lane), schedule_milestones is a
// new table, schedule_revisions is a new append-only ledger (RPC-only writes,
// empty until Slice 05 cuts the signature baseline).
//
// `resolveSchedule` (packages/utils/src/schedule.ts) is the ONE pure resolver
// — this module's job is only to fetch rows and map them snake_case→camelCase
// into its pinned input shapes (SchedulePhaseInput / ScheduleMilestoneInput).
// It never computes a date itself.
//
// Contract notes carried from the resolver's review (read before touching the
// render layer):
//  - A `chain_does_not_fit` conflict sets BOTH `phaseId` and `anchorId` to the
//    anchored phase's own id (the anchor names itself as the point of
//    conflict) — don't assume `anchorId` always points upstream.
//  - An anchored phase's `slackDays` is the float absorbed at ITS OWN pin —
//    the gap between the chain arriving at it and its pinned start ("holds
//    Sep 21 with N days slack"), NOT a downstream anchor's gap. It is null when
//    nothing feeds the anchor (a root pin) or the chain overruns it (a
//    chain_does_not_fit conflict). An unanchored phase's `slackDays` is instead
//    the min float across the anchors reachable downstream of it.
//
// useProjectPhases (./use-project-v2) is the ONE canonical project_phases
// fetch — useResolvedSchedule composes it, never re-queries the table.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

export type PhaseRow = Tables<'project_phases'>;
export type MilestoneRow = Tables<'schedule_milestones'>;
/**
 * `Tables<'schedule_revisions'>` widened on ONE column: `phase_snapshots` is
 * typed `unknown` here instead of the generated `Json`. Slice 05 (R100
 * "Memory") never trusts the snapshot's shape at this boundary — it is a
 * frozen resolver-input array cut by `cut_schedule_revision` (00326), and the
 * ONE place that narrows it is the pure, TOTAL `snapshotToResolverInputs`
 * (apps/designer-portal/src/lib/document/schedule-baseline-derivation.ts),
 * which already accepts `unknown` and degrades rather than throwing on a
 * malformed shape. Typing it loosely here forces every consumer through that
 * narrowing instead of trusting `Json`'s shape at the query boundary.
 */
export type ScheduleRevisionRow = Omit<Tables<'schedule_revisions'>, 'phase_snapshots'> & {
  phase_snapshots: unknown;
};

// ─────────────────────────────────────────────────────────────────────────────
// Enum narrowing — the DB columns are free TEXT (no CHECK constraint mirrors
// the resolver's closed unions 1:1); narrow defensively, default to the
// resolver's safest value rather than throwing on an unexpected string.
// ─────────────────────────────────────────────────────────────────────────────

function narrow<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
}

const PHASE_STATUSES: readonly PhaseStatus[] = ['pending', 'in_progress', 'active', 'completed', 'delayed'];
const MILESTONE_KINDS: readonly MilestoneKind[] = ['signoff', 'decision', 'delivery', 'event'];
const MILESTONE_STATUSES: readonly MilestoneStatus[] = ['upcoming', 'due', 'signed', 'slipped'];

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Queries
// ═══════════════════════════════════════════════════════════════════════════

/**
 * schedule_milestones for a project, joined through project_phases (the
 * table has no project_id of its own — every milestone hangs off a phase).
 * Key `['schedule-milestones', projectId]`.
 */
export function useScheduleMilestones(projectId: string | undefined) {
  return useQuery({
    queryKey: ['schedule-milestones', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<MilestoneRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('schedule_milestones')
        .select('*, project_phases!inner(project_id)')
        .eq('project_phases.project_id', projectId)
        .order('sort_order');
      if (error) throw error;
      // The join is a filter only — strip the embed so the returned shape is
      // exactly the schedule_milestones row (Tables<'schedule_milestones'>).
      return (data ?? []).map((row: MilestoneRow & { project_phases?: unknown }) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { project_phases: _joined, ...rest } = row;
        return rest as MilestoneRow;
      });
    },
  });
}

/**
 * schedule_revisions for a project, latest first. Read-only surface — writes
 * are RPC-only (Slice 05); this will return `[]` until a baseline is cut.
 * Key `['schedule-revisions', projectId]`.
 */
export function useScheduleRevisions(projectId: string | undefined) {
  return useQuery({
    queryKey: ['schedule-revisions', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ScheduleRevisionRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('schedule_revisions')
        .select('*')
        .eq('project_id', projectId)
        .order('v', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ScheduleRevisionRow[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Pure row → resolver-input mappers (snake_case DB row → camelCase resolver
// input). Exported for direct unit testing — no Supabase, no React involved.
// ═══════════════════════════════════════════════════════════════════════════

export function mapPhaseRowToScheduleInput(row: PhaseRow): SchedulePhaseInput {
  return {
    id: row.id,
    name: row.name,
    durationDays: row.duration_days ?? null,
    durationWeeks: row.duration_weeks ?? null,
    followsPhaseId: row.follows_phase_id ?? null,
    anchorDate: row.anchor_date ?? null,
    lane: row.lane === 'thread' ? 'thread' : 'main',
    startDate: row.start_date ?? null,
    targetEndDate: row.target_end_date ?? null,
    sortOrder: row.sort_order ?? 0,
    status: narrow(row.status, PHASE_STATUSES, 'pending'),
  };
}

export function mapMilestoneRowToScheduleInput(row: MilestoneRow): ScheduleMilestoneInput {
  return {
    id: row.id,
    phaseId: row.phase_id,
    name: row.name,
    kind: narrow(row.kind, MILESTONE_KINDS, 'event'),
    offsetDays: row.offset_days ?? null,
    anchorDate: row.anchor_date ?? null,
    status: narrow(row.status, MILESTONE_STATUSES, 'upcoming'),
    sortOrder: row.sort_order ?? 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// useResolvedSchedule — the single door the ScheduleSpine UI consumes.
// ═══════════════════════════════════════════════════════════════════════════

export interface UseResolvedScheduleResult {
  /** Raw project_phases rows (from useProjectPhases — no second fetch). */
  phases: PhaseRow[];
  /** Raw schedule_milestones rows. */
  milestones: MilestoneRow[];
  /** null while either source is loading. */
  resolved: ResolvedSchedule | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Composes the project's phases (useProjectPhases — the one canonical fetch,
 * NOT re-queried here) with schedule_milestones, maps both to the resolver's
 * pinned input shapes, and calls the pure `resolveSchedule` (@patina/utils).
 * This is the single door the ScheduleSpine UI consumes — everything it
 * renders (dates, lanes, conflicts, slack) comes from `resolved`.
 */
export function useResolvedSchedule(projectId: string | undefined): UseResolvedScheduleResult {
  const phasesQuery = useProjectPhases(projectId ?? '');
  const milestonesQuery = useScheduleMilestones(projectId);

  // Memoize the fallback arrays — a fresh `[]` per render would defeat the
  // useMemo deps below (and the stability comment on `today`).
  const phases = useMemo(() => (phasesQuery.data ?? []) as PhaseRow[], [phasesQuery.data]);
  const milestones = useMemo(() => (milestonesQuery.data ?? []) as MilestoneRow[], [milestonesQuery.data]);

  // "Not ready" must key on DATA AVAILABILITY, not on active fetching: in
  // TanStack Query v5, isLoading = isPending && isFetching, so a DISABLED
  // query (projectId undefined → enabled: false) has isLoading === false
  // forever while its data is still undefined. isPending is the honest
  // "no data yet" signal either way. The returned field keeps the
  // `isLoading` name (contract) but derives from isPending.
  const hasData = phasesQuery.data !== undefined && milestonesQuery.data !== undefined;
  const isLoading = phasesQuery.isPending || milestonesQuery.isPending;
  const isError = phasesQuery.isError || milestonesQuery.isError;

  // R100: the single impure door — nothing else in the app computes time.
  // Keyed on the data arrays (not a raw `new Date()`) so `today` is stable
  // across unrelated re-renders and only moves when the underlying data does.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [phases, milestones]);

  const resolved = useMemo<ResolvedSchedule | null>(() => {
    // null until BOTH sources have real data — a disabled or still-pending
    // query must read as "not ready," never as a confirmed-empty schedule.
    if (!hasData) return null;
    return resolveSchedule(phases.map(mapPhaseRowToScheduleInput), milestones.map(mapMilestoneRowToScheduleInput), {
      // Slice 01's specimen chains anchor at the root phase itself; a future
      // slice may thread the project's own start_date here instead of
      // leaving the forward-compute origin undefined.
      projectStartDate: undefined,
      today,
    });
  }, [phases, milestones, hasData, today]);

  return { phases, milestones, resolved, isLoading, isError };
}
