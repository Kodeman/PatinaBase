import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Tables } from '../database.types';
import { settleScheduleWrite } from './schedule-write-settle';

// ═══════════════════════════════════════════════════════════════════════════
// The install window (R112, I126 · migration 00476)
//
// The install week's commitment act. A window is HELD (a studio thought, and
// studio-only under RLS), then CONFIRMED — which is the moment the anchor is
// written, through the same ripple→commit→revision door every ceremony uses —
// then RELEASED, which unpins that anchor with its own stated impact (I126:
// anchors refuse silent movement, and that reaches releases).
//
// The date itself lives on project_phases.anchor_date. This row is the
// EVIDENCE of commitment; schedule_revisions is the date memory. Two records,
// two jobs.
//
// R110 rides both write faces: a null disclosed impact still performs the act
// but downgrades its schedule effect to a schedule_proposals row, server-side.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

export type InstallWindowRow = Tables<'install_windows'>;

// ═══════════════════════════════════════════════════════════════════════════
// `ScheduleDisclosedImpactInput` is a STRUCTURAL MIRROR of designer-portal's
// `ScheduleDisclosedImpact` (lib/document/schedule-impact.ts), not an import
// of it — packages/supabase cannot depend on an app. Same reasoning, same
// shape discipline as `RipplePendingEditInput` in use-schedule-compose.ts.
// ═══════════════════════════════════════════════════════════════════════════

export interface ScheduleDisclosedImpactInput {
  sentence: string;
  kind: string;
  anchorDate: string;
  followerCount: number;
  /** A move's measure: anchors that ABSORBED it. Absent on an unpin. */
  heldAnchorCount?: number;
  /** An unpin's measure: anchors the removal leaves standing. Absent on a
   *  move. The two are not comparable, so they never share a name. */
  otherAnchorCount?: number;
  conflictCount: number;
}

/**
 * The project's live install window — the one that is held or confirmed — or
 * null. A released window is history and never returns here.
 * Key `['install-window', projectId]`.
 */
export function useInstallWindow(projectId: string | undefined) {
  return useQuery({
    queryKey: ['install-window', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<InstallWindowRow | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('install_windows')
        .select('*')
        .eq('project_id', projectId)
        .neq('state', 'released')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as InstallWindowRow | null;
    },
  });
}

async function invalidateAfterInstallWindowAct(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: any,
  projectId: string,
) {
  queryClient.invalidateQueries({ queryKey: ['install-window', projectId] });
  queryClient.invalidateQueries({ queryKey: ['schedule-proposals', projectId] });
  // The desk is where the need this act resolves is rendered, and it reads
  // schedule_proposals directly — both confirm and release can write one
  // (R110's downgrade, a contradiction, an undisclosed release) and both can
  // move project_phases.anchor_date, which the desk's schedule motion derives
  // from. Without this an open desk keeps asking about a window already acted on.
  queryClient.invalidateQueries({ queryKey: ['document-state', 'desk'] });
  // The shared key set (project-phases/schedule-milestones/project-v2/
  // schedule-revisions) plus the workflow invalidator, plus the
  // resolved-dates materialization (00480) — see schedule-write-settle.ts.
  await settleScheduleWrite(queryClient, projectId);
}

/** Hold a window. Writes no anchor and cuts no revision — a hold is not a
 *  commitment, and only the studio can see it. */
export function useHoldInstallWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      startsOn,
      endsOn,
    }: {
      projectId: string;
      startsOn: string;
      endsOn: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('hold_install_window', {
        p_project_id: projectId,
        p_starts_on: startsOn,
        p_ends_on: endsOn,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, { projectId }) => {
      void invalidateAfterInstallWindowAct(queryClient, projectId);
    },
  });
}

/** Confirm a held window: its start becomes the install phase's anchor. A null
 *  `disclosedImpact` still confirms, but the anchor downgrades to a proposal
 *  (R110), enforced server-side. */
export function useConfirmInstallWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      windowId,
      disclosedImpact,
    }: {
      windowId: string;
      projectId: string;
      disclosedImpact?: ScheduleDisclosedImpactInput | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('confirm_install_window', {
        p_window_id: windowId,
        p_disclosed_impact: disclosedImpact ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, { projectId }) => {
      void invalidateAfterInstallWindowAct(queryClient, projectId);
    },
  });
}

/** Release a window. Releasing a CONFIRMED window unpins its anchor with the
 *  stated impact (I126); releasing a held one is bookkeeping. */
export function useReleaseInstallWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      windowId,
      reason,
      disclosedImpact,
    }: {
      windowId: string;
      projectId: string;
      reason: string;
      disclosedImpact?: ScheduleDisclosedImpactInput | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('release_install_window', {
        p_window_id: windowId,
        p_reason: reason,
        p_disclosed_impact: disclosedImpact ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, { projectId }) => {
      void invalidateAfterInstallWindowAct(queryClient, projectId);
    },
  });
}
