/**
 * Resolve `designer_clients.id` (the relationship id `client_discovery` is
 * keyed on) for a no-login household's document_state row — Arrival Arc
 * (R106 §5 / build-plan 2.5, DiscoveryRecap's resolution finding). Portal-
 * local like `use-person-documents.ts`, whose two-leg pattern this mirrors:
 *
 *  · A login client resolves in ONE query on `client_profile_id`
 *    (`useDesignerClientForClientUser`, unchanged — this hook plays no part
 *    in that path).
 *  · A no-login household has no profile to join on. `document_state`'s
 *    `engagement_id` IS `designer_clients.id` while the row is Shape D
 *    (relationship, 'discovery' active) — no query needed, the caller uses
 *    it directly. Once the engagement flips to Shape B (proposal,
 *    'direction'/'proposal' active), `engagement_id` becomes the proposal
 *    chain root instead — this hook resolves through `proposals
 *    .designer_client_id` (00327/I62: the no-login rescue link, stamped by
 *    `begin_direction_from_discovery` and carried through `clone_proposal`)
 *    using the row's live `proposal_id`.
 *
 * Shape A (project) carries no such column on `document_state` today — a
 * no-login household's DiscoveryRecap at Project stage stays unresolved
 * here (falls to the apology). Out of this package's scope; noted loudly in
 * the module doc rather than silently left unexplained.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

/** `proposals.designer_client_id` for one proposal — the Shape-B leg of the
 *  no-login household resolution. `null` when the proposal carries no link
 *  (pre-Arrival-Arc proposals, or a login client's proposal). */
export function useDesignerClientIdForProposal(proposalId: string | null) {
  return useQuery<string | null>({
    queryKey: ['designer-client-for-proposal', proposalId],
    enabled: Boolean(proposalId),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('proposals')
        .select('designer_client_id')
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return (data?.designer_client_id ?? null) as string | null;
    },
  });
}
