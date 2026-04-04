import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

/**
 * Activate a signed proposal as a live project.
 *
 * Calls the `activate_proposal_as_project` RPC function which atomically:
 * 1. Creates a project from proposal data
 * 2. Copies rooms, FF&E items, phases, payment milestones
 * 3. Copies exclusions and change order terms
 * 4. Back-links the proposal to the new project
 * 5. Updates the client lifecycle stage to 'active'
 */
export function useActivateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      proposalId,
      startDate,
    }: {
      proposalId: string;
      startDate?: string; // ISO date string, defaults to today
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('activate_proposal_as_project', {
        p_proposal_id: proposalId,
        p_start_date: startDate || new Date().toISOString().split('T')[0],
      });

      if (error) throw error;

      // The RPC returns the new project UUID
      return data as string;
    },
    onSuccess: (projectId, { proposalId }) => {
      // Invalidate all related caches
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
