/**
 * Proposal team membership hooks (proposal_team_members table, migration 00137).
 * Mirrors use-project-team.ts but scoped to the proposal phase. On
 * `activate_proposal_as_project()` these rows copy into project_team_members.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export type ProposalRole = 'lead_designer' | 'support_designer' | 'vendor' | 'client' | 'bookkeeper';

export interface ProposalTeamMember {
  id: string;
  proposal_id: string;
  user_id: string;
  role: ProposalRole;
  permissions: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    full_name: string;
    email: string;
  };
}

export function useProposalTeamMembers(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-team', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_team_members')
        .select(`
          *,
          user:profiles!user_id(id, full_name, email)
        `)
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProposalTeamMember[];
    },
    enabled: !!proposalId,
  });
}

export function useAddProposalTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      userId,
      role,
      permissions = {},
      sortOrder,
    }: {
      proposalId: string;
      userId: string;
      role: ProposalRole;
      permissions?: Record<string, unknown>;
      sortOrder?: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_team_members')
        .insert({
          proposal_id: proposalId,
          user_id: userId,
          role,
          permissions,
          sort_order: sortOrder ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['proposal-team', vars.proposalId] });
    },
  });
}

export function useRemoveProposalTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, proposalId }: { memberId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('proposal_team_members')
        .delete()
        .eq('id', memberId);
      if (error) throw error;
      return { memberId, proposalId };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['proposal-team', vars.proposalId] });
    },
  });
}
