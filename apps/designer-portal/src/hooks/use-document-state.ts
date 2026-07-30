/**
 * Single-engagement read of `document_state` (00191/00192) — the document
 * shell's source for identity + active section (§4 via the view, §13 Slice 2).
 *
 * The id accepts ANY of the engagement's keys (engagement_id / project_id /
 * proposal_id / lead_id) and canonicalizes to the view row — the resolver
 * blessed by spec §3, logged as DECISIONS.md I8. The URL is not rewritten,
 * with TWO exceptions where the document's identity moves across a threshold:
 *   · R6 — an activated proposal's id resolves to a redirect to
 *     `/doc/[projectId]` so pre-signing links survive the signing moment.
 *   · F1 (walk 2026-07) — an ACCEPTED lead's id resolves to a redirect to
 *     `/doc/[designerClientId]`: Accept moves the identity to the
 *     designer_clients relationship row (shape D keys engagement_id on it,
 *     and shape C excludes status 'accepted'), so pre-accept links survive
 *     the intake moment the same way.
 *   · R21 (the dissolve) — a client_decision's id resolves to a redirect to
 *     `/doc/[projectId]`: the decision never had a document of its own, it is a
 *     margin item in the project's. /portal/decisions/[id]'s permanent redirect
 *     rides this leg.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { DocumentStateRow } from '@/lib/document/desk-derivation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DocumentResolution =
  | { kind: 'engagement'; row: DocumentStateRow }
  // The target document id: an activated proposal's project (R6) or an
  // accepted lead's designer_clients relationship (F1). The consumer just
  // replaces the URL with `/doc/${projectId}` either way.
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

      // R21 dissolve: /portal/decisions/[id] was a real page; the act it held is
      // a margin item inside the document the decision belongs to. Its permanent
      // redirect sends the decision id to /doc/[id], so the resolver has to know
      // that shape too — third miss-path leg, same style as R6/F1: one lookup,
      // only when nothing else answered.
      //
      // NOTE: `client_decisions.project_id` is nullable. A decision recorded
      // against the client relationship before a project exists resolves to
      // nothing here and falls through to 'missing' — per the R21 URL contract,
      // which names project_id as the only hop. If those turn out to be reachable
      // in the wild, the honest next hop is designer_client_id (the shape-D
      // document identity), and that needs a ruling, not a guess.
      const { data: decision, error: decisionError } = await supabase
        .from('client_decisions')
        .select('project_id')
        .eq('id', id)
        .maybeSingle();
      if (decisionError) throw decisionError;
      if (decision?.project_id) {
        return { kind: 'redirect', projectId: decision.project_id };
      }

      return { kind: 'missing' };
    },
  });
}
