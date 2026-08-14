import type { QueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { resolveSchedule } from '@patina/utils';
import { invalidateProjectWorkflow } from './use-project-workflow';
import {
  mapPhaseRowToScheduleInput,
  mapMilestoneRowToScheduleInput,
  type PhaseRow,
  type MilestoneRow,
} from './use-schedule';

// ═══════════════════════════════════════════════════════════════════════════
// settleScheduleWrite — the shared tail every schedule-shaping mutation hook
// needs (Date Instruments program, Lane C — data).
//
// Every hook that can move the chain (duration/anchor/follows/lane),
// schedule_milestones, or an install window duplicated the same cache
// invalidation block (['project-phases', id] + ['schedule-milestones', id] +
// ['project-v2', id] + ['schedule-revisions', id] + invalidateProjectWorkflow
// — see use-schedule-compose.ts, use-install-window.ts,
// use-schedule-proposals.ts). This is that block, factored once, PLUS the
// derived write 00480 adds: after invalidating, it re-resolves the schedule
// exactly the way useResolvedSchedule (use-schedule.ts) does — same fresh
// selects, same mappers, same resolveSchedule(..., { projectStartDate, today })
// call — and mirrors the result onto project_phases.start_date/
// target_end_date via the materialize_schedule_dates RPC, so a legacy reader
// (the Calendar Folio, exports, anything that still selects the row directly
// instead of running the resolver) sees what the resolver already shows.
//
// Materialization is DERIVED, never authoritative: the chain and the
// resolver remain the source of truth. A failure here must never fail the
// user's actual commit — "never rethrows" is structural: the ENTIRE body,
// invalidation included, runs inside one try/catch that only logs.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

export async function settleScheduleWrite(
  queryClient: QueryClient,
  projectId: string,
): Promise<void> {
  try {
    // (1) The shared key set every schedule-shaping hook already invalidated
    // individually. Callers that touch additional keys (install windows'
    // ['install-window', id]/['schedule-proposals', id]/['document-state',
    // 'desk'], useDismissScheduleProposal's ['schedule-proposals', id], …)
    // invalidate those themselves, in addition to calling this.
    queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] });
    queryClient.invalidateQueries({ queryKey: ['schedule-milestones', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
    queryClient.invalidateQueries({ queryKey: ['schedule-revisions', projectId] });
    await invalidateProjectWorkflow(queryClient, projectId);

    // (2) Fresh-fetch phases + milestones + project start date — mirrors
    // useProjectPhases (use-project-v2.ts), useScheduleMilestones and
    // useProjectStartDate (use-schedule.ts) exactly, including the
    // project_phases join-strip on the milestone rows.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getSupabase() as any;

    const [phasesResult, milestonesResult, projectResult] = await Promise.all([
      supabase
        .from('project_phases')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('schedule_milestones')
        .select('*, project_phases!inner(project_id)')
        .eq('project_phases.project_id', projectId)
        .order('sort_order'),
      supabase.from('projects').select('start_date').eq('id', projectId).maybeSingle(),
    ]);

    if (phasesResult.error) throw phasesResult.error;
    if (milestonesResult.error) throw milestonesResult.error;
    if (projectResult.error) throw projectResult.error;

    const phases = (phasesResult.data ?? []) as PhaseRow[];
    const milestones = ((milestonesResult.data ?? []) as Array<
      MilestoneRow & { project_phases?: unknown }
    >).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { project_phases: _joined, ...rest } = row;
      return rest as MilestoneRow;
    });
    const projectStartDate = (projectResult.data?.start_date ?? null) as string | null;
    // R100's single impure door is useResolvedSchedule's own `today`; this is
    // a one-shot settle call, not a render, so there is no stability memo to
    // reuse — a fresh read is exactly what a fresh resolve needs.
    const today = new Date().toISOString().slice(0, 10);

    const resolved = resolveSchedule(
      phases.map(mapPhaseRowToScheduleInput),
      milestones.map(mapMilestoneRowToScheduleInput),
      { projectStartDate, today },
    );

    // (3) Mirror the resolved dates onto the legacy columns (00480).
    const { error: materializeError } = await supabase.rpc('materialize_schedule_dates', {
      p_project_id: projectId,
      p_phases: resolved.phases.map((phase) => ({
        phase_id: phase.id,
        start_date: phase.start,
        target_end_date: phase.end,
      })),
    });
    if (materializeError) throw materializeError;

    // (4) The materialize write can have changed start_date/target_end_date
    // server-side — invalidate project-phases once more so a subsequent read
    // does not serve the pre-materialize snapshot from cache.
    queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] });
  } catch (error) {
    // Materialization is derived — it must never fail the user's commit.
    // eslint-disable-next-line no-console
    console.error('settleScheduleWrite: materialization failed', error);
  }
}
