/**
 * Single-engagement read of `document_state` (00191/00192) — the document
 * shell's source for identity + active section (§4 via the view, §13 Slice 2).
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
 *   · R21 (the dissolve) — a client_decision's id resolves to a redirect to
 *     `/doc/[projectId]`, or to `/doc/[designerClientId]` when the decision has
 *     no project yet: the decision never had a document of its own, it is a
 *     margin item in the document it belongs to.
 *     /portal/decisions/[id]'s permanent redirect rides this leg.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { DocumentStateRow } from '@/lib/document/desk-derivation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DocumentResolution =
  | { kind: 'engagement'; row: DocumentStateRow }
  // The target document id: an activated proposal's project (R6), an
  // accepted lead's designer_clients relationship (F1), or a started
  // Direction chain's root/project (J6). The consumer just replaces the
  // URL with `/doc/${projectId}` either way.
  | { kind: 'redirect'; projectId: string }
  | { kind: 'missing' };

export function useDocumentEngagement(id: string) {
  return useQuery<DocumentResolution>({
    queryKey: ['document-state', 'engagement', id],
    enabled: UUID_RE.test(id),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('document_state')
        .select('*')
        .or(`engagement_id.eq.${id},project_id.eq.${id},proposal_id.eq.${id},lead_id.eq.${id}`)
        .limit(1);
      if (error) throw error;
      const row = (data ?? [])[0] as DocumentStateRow | undefined;
      if (row) return { kind: 'engagement', row };

      // R6: the document grew across the signing moment — an activated
      // proposal's id redirects to its project document (one extra lookup
      // on the miss path only).
      const { data: prop, error: propError } = await supabase
        .from('proposals')
        .select('project_id')
        .eq('id', id)
        .maybeSingle();
      if (propError) throw propError;
      if (prop?.project_id) return { kind: 'redirect', projectId: prop.project_id };

      // F1: the document grew across the INTAKE moment — Accept converts the
      // lead into a designer_clients relationship (00224), whose row is the
      // document's new identity (shape D). Mirror R6: one extra lookup on the
      // miss path only, then redirect so the pre-accept link keeps answering.
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id, status')
        .eq('id', id)
        .maybeSingle();
      if (leadError) throw leadError;
      if (lead?.status === 'accepted') {
        const { data: rels, error: relError } = await supabase
          .from('designer_clients')
          .select('id')
          .eq('lead_id', id)
          .limit(1);
        if (relError) throw relError;
        const rel = (rels ?? [])[0] as { id: string } | undefined;
        if (rel?.id) return { kind: 'redirect', projectId: rel.id };
      }

      // J6: the document grew across the DIRECTION-START moment —
      // begin_direction_from_discovery (00327) stamps a fresh draft
      // proposal's designer_client_id to this relationship's own id, so the
      // pre-Direction canonical URL (/doc/[designerClientId]) has nothing
      // answering it once Shape D's discovery view excludes the relationship
      // row. Query by designer_client_id directly (NOT .maybeSingle() —
      // clone_proposal carries the link onto every revision, so multiple
      // rows can match). An activated-project row wins over any live
      // draft/sent/viewed/accepted/declined/expired row; among the live
      // rows, resolve to the chain root exactly as Shape B does
      // (coalesce(parent_proposal_id, id)).
      const { data: chainProps, error: chainError } = await supabase
        .from('proposals')
        .select('id, parent_proposal_id, project_id, status')
        .eq('designer_client_id', id);
      if (chainError) throw chainError;
      const chainRows = (chainProps ?? []) as Array<{
        id: string;
        parent_proposal_id: string | null;
        project_id: string | null;
        status: string;
      }>;
      const activated = chainRows.find((r) => r.project_id);
      if (activated?.project_id) {
        return { kind: 'redirect', projectId: activated.project_id };
      }
      const LIVE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'];
      const live = chainRows.find((r) => LIVE_STATUSES.includes(r.status));
      if (live) {
        return { kind: 'redirect', projectId: live.parent_proposal_id ?? live.id };
      }

      // R21 dissolve: /portal/decisions/[id] was a real page; the act it held is
      // a margin item inside the document the decision belongs to. Its permanent
      // redirect sends the decision id to /doc/[id], so the resolver has to know
      // that shape too — fourth miss-path leg, same style as R6/F1/J6: one
      // lookup, only when nothing else answered.
      //
      // NOTE: `client_decisions.project_id` is NULLABLE — a decision recorded
      // against the client relationship before a project exists carries none.
      // `designer_client_id` is NOT NULL, and it IS the shape-D document
      // identity (the same id F1 above redirects an accepted lead to), so a
      // project-less decision hops there rather than dead-ending. Preference
      // order matters: the project document is the closer home when it exists.
      // Either way the target goes back through this resolver, whose shape-D /
      // miss legs handle it — a stale relationship id lands on 'missing'
      // gracefully instead of a blank.
      const { data: decision, error: decisionError } = await supabase
        .from('client_decisions')
        .select('project_id, designer_client_id')
        .eq('id', id)
        .maybeSingle();
      if (decisionError) throw decisionError;
      if (decision?.project_id) {
        return { kind: 'redirect', projectId: decision.project_id };
      }
      if (decision?.designer_client_id) {
        return { kind: 'redirect', projectId: decision.designer_client_id };
      }

      return { kind: 'missing' };
    },
  });
}
