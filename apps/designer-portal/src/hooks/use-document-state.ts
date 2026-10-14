/**
 * Single-engagement open of the Document — the document shell's source for
 * identity + active section (§4 via `document_state`, §13 Slice 2).
 *
 * One read: `document_open(p_id)` (00792, US-34 N9) resolves the id, answers
 * the row and the ids the Document reads next, or says where the document
 * moved. Before N9 this hook walked up to six sequential reads; the legs now
 * live in that function, and supabase/tests/document_open_test.sql pins each.
 *
 * The id accepts ANY of the engagement's keys (engagement_id / project_id /
 * proposal_id / lead_id) and canonicalizes to the view row — the resolver
 * blessed by spec §3, logged as DECISIONS.md I8. The URL is not rewritten,
 * with FOUR exceptions where the document's identity moves across a threshold:
 *   · R6 — an activated proposal's id resolves to a redirect to
 *     `/doc/[projectId]` so pre-signing links survive the signing moment.
 *   · F1 (walk 2026-07) — an ACCEPTED lead's id resolves to a redirect to
 *     `/doc/[designerClientId]`: Accept moves the identity to the
 *     designer_clients relationship row (shape D keys engagement_id on it,
 *     and shape C excludes status 'accepted'), so pre-accept links survive
 *     the intake moment the same way.
 *   · J6 (Direction A) — a pre-Direction relationship id whose
 *     designer_clients row has since started a Direction chain (00327's
 *     begin_direction_from_discovery, which stamps the new draft proposal's
 *     designer_client_id to the relationship id) resolves to a redirect to
 *     `/doc/[chainRootId]` (an activated chain's project, or the chain's own
 *     root proposal id) so the pre-Direction URL survives the transition.
 *     Several chains on one relationship resolve to the oldest (NAV-1).
 *   · R21 (the dissolve) — a client_decision's id resolves to a redirect to
 *     `/doc/[projectId]`, or to `/doc/[designerClientId]` when the decision has
 *     no project yet: the decision never had a document of its own, it is a
 *     margin item in the document it belongs to.
 *     /portal/decisions/[id]'s permanent redirect rides this leg.
 */

import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { createBrowserClient, docKeys } from '@patina/supabase';
import type { DocumentStateRow } from '@/lib/document/desk-derivation';
import type { DeskData } from './use-desk-engagements';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The ids the Document reads next, resolved with the row (00792). The first
 * three are the row's own; `designer_client_id` is the engagement's
 * relationship (its own id, its live proposal's, or its project proposal's),
 * and `studio_id` / `lead_user_id` are a project's studio and lead.
 */
export interface DocumentOpenIds {
  project_id: string | null;
  proposal_id: string | null;
  lead_id: string | null;
  designer_client_id: string | null;
  studio_id: string | null;
  lead_user_id: string | null;
}

export type DocumentResolution =
  // `ids` is absent on the Desk-seeded placeholder, present once the read lands.
  | { kind: 'engagement'; row: DocumentStateRow; ids?: DocumentOpenIds }
  // The target document id: an activated proposal's project (R6), an
  // accepted lead's designer_clients relationship (F1), a started Direction
  // chain's root/project (J6), or a decision's document (R21). The consumer
  // just replaces the URL with `/doc/${projectId}` either way.
  | { kind: 'redirect'; projectId: string }
  | { kind: 'missing' };

export function documentEngagementQueryOptions(
  id: string,
): UseQueryOptions<DocumentResolution> {
  return {
    queryKey: docKeys.engagement(id),
    enabled: UUID_RE.test(id),
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('document_open', { p_id: id });
      if (error) throw error;
      return data as DocumentResolution;
    },
  };
}

export function useDocumentEngagement(id: string) {
  const queryClient = useQueryClient();
  const desk = queryClient.getQueryData<DeskData>(docKeys.desk());
  // Seed only where document_open answers the same row: a Desk row's
  // engagement_id is its own key in document_state. Another key (a proposal
  // or lead id) may have moved since the Desk read.
  const seededRow = desk?.live.find((row) => row.engagement_id === id);

  return useQuery<DocumentResolution>({
    ...documentEngagementQueryOptions(id),
    placeholderData: seededRow ? { kind: 'engagement', row: seededRow } : undefined,
  });
}
