import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Tables } from '../database.types';
import { invalidateProjectWorkflow } from './use-project-workflow';
import { serializeRippleEditForRpc, type RipplePendingEditInput } from './use-schedule-compose';

// ═══════════════════════════════════════════════════════════════════════════
// Schedule proposals (R109/R110, I130 · migration 00475)
//
// A proposal is what an act that could not state its schedule impact leaves
// behind: an operational fact (a purchase order sent, a delivery received), a
// client-executed ceremony, or a ceremony whose impact was uncomputable. It is
// never an anchor. The designer commits it in ONE act (I56 "assisted,
// confirmed, never silent") — the commit runs the ordinary
// `commit_schedule_edit` door, then ratchets the proposal to 'committed'.
//
// Studio-only under RLS (R101 working scaffolding); there is no client read.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

export type ScheduleProposalRow = Tables<'schedule_proposals'>;

/** Bounded like every desk-facing read (the Wave 1 truncation pattern). */
export const SCHEDULE_PROPOSAL_READ_LIMIT = 50;

/**
 * Live ('proposed') schedule proposals for a project, newest first.
 * Key `['schedule-proposals', projectId]`.
 */
export function useScheduleProposals(projectId: string | undefined) {
  return useQuery({
    queryKey: ['schedule-proposals', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ScheduleProposalRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('schedule_proposals')
        .select('*')
        .eq('project_id', projectId)
        .eq('state', 'proposed')
        .order('created_at', { ascending: false })
        .limit(SCHEDULE_PROPOSAL_READ_LIMIT);
      if (error) throw error;
      return (data ?? []) as ScheduleProposalRow[];
    },
  });
}

async function invalidateAfterProposalResolution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: any,
  projectId: string,
) {
  queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] });
  queryClient.invalidateQueries({ queryKey: ['schedule-milestones', projectId] });
  queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
  queryClient.invalidateQueries({ queryKey: ['schedule-revisions', projectId] });
  queryClient.invalidateQueries({ queryKey: ['schedule-proposals', projectId] });
  // The desk is where the need this act resolves is rendered; without this an
  // open desk keeps asking for a proposal already committed.
  queryClient.invalidateQueries({ queryKey: ['document-state', 'desk'] });
  await invalidateProjectWorkflow(queryClient, projectId);
}

/**
 * Commit a proposal: apply its anchor through the ordinary commit door, then
 * ratchet the proposal to 'committed'. One designer act, two writes — the
 * anchor first, so a failed ratchet never claims an anchor that did not land.
 */
export function useCommitScheduleProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      projectId,
      edit,
      reason,
    }: {
      proposalId: string;
      projectId: string;
      edit: RipplePendingEditInput;
      reason?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('commit_schedule_edit', {
        p_project_id: projectId,
        p_edits: [serializeRippleEditForRpc(edit)],
        p_reason: reason ?? null,
      });
      if (error) throw error;
      const { error: resolveError } = await supabase
        .from('schedule_proposals')
        .update({
          state: 'committed',
          resolved_at: new Date().toISOString(),
          resolved_by: (await supabase.auth.getUser()).data?.user?.id ?? null,
        })
        .eq('id', proposalId)
        .eq('state', 'proposed');
      if (resolveError) throw resolveError;
      return data as number;
    },
    onSuccess: (_data, { projectId }) => {
      void invalidateAfterProposalResolution(queryClient, projectId);
    },
  });
}

/** Dismiss a proposal. Nothing moves; the proposal stops asking. */
export function useDismissScheduleProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ proposalId }: { proposalId: string; projectId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('schedule_proposals')
        .update({
          state: 'dismissed',
          resolved_at: new Date().toISOString(),
          resolved_by: (await supabase.auth.getUser()).data?.user?.id ?? null,
        })
        .eq('id', proposalId)
        .eq('state', 'proposed');
      if (error) throw error;
    },
    onSuccess: (_data, { projectId }) => {
      void invalidateAfterProposalResolution(queryClient, projectId);
    },
  });
}
