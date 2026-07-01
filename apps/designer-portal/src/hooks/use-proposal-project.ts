'use client';

/**
 * useProposalProject — does a project exist for this proposal? (F10, walk 2026-07)
 *
 * The signed seal (ProposalWatch's settled branch) must READ the truth rather
 * than claim it: a sign that did not auto-activate (sign_proposal 00210 with
 * p_auto_activate=false, or the legacy sign route) leaves no project row, and
 * the band must carry the open-the-project act instead (the R44 two-step
 * safety net, DECISIONS.md I7).
 *
 * The watch renders the chain's LIVE version (document_state shape B picks
 * `distinct on (chain_root) … order by version desc`), but activation
 * back-links whichever version was signed — so the whole chain is checked,
 * in both directions of the link (proposals.project_id is written together
 * with projects.proposal_id in activate_proposal_as_project, but both FKs
 * are ON DELETE SET NULL, so neither side alone is authoritative).
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export function useProposalProject(proposalId: string) {
  return useQuery<{ projectId: string | null }>({
    queryKey: ['proposal-project', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const supabase = getSupabase();

      // 1 — this version's own back-link (the common case).
      const { data: prop, error } = await supabase
        .from('proposals')
        .select('id, parent_proposal_id, project_id')
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      if (!prop) return { projectId: null };
      if (prop.project_id) return { projectId: prop.project_id as string };

      // 2 — any sibling in the chain (a superseded version may hold the link).
      const chainRootId = (prop.parent_proposal_id as string | null) ?? (prop.id as string);
      const { data: chain, error: chainError } = await supabase
        .from('proposals')
        .select('id, project_id')
        .or(`id.eq.${chainRootId},parent_proposal_id.eq.${chainRootId}`);
      if (chainError) throw chainError;
      const rows = (chain ?? []) as { id: string; project_id: string | null }[];
      const linked = rows.find((r) => r.project_id);
      if (linked?.project_id) return { projectId: linked.project_id };

      // 3 — the projects side of the link, for any version in the chain.
      const chainIds = rows.length > 0 ? rows.map((r) => r.id) : [proposalId];
      const { data: projs, error: projError } = await supabase
        .from('projects')
        .select('id')
        .in('proposal_id', chainIds)
        .limit(1);
      if (projError) throw projError;
      const proj = (projs ?? [])[0] as { id: string } | undefined;
      return { projectId: proj?.id ?? null };
    },
  });
}
