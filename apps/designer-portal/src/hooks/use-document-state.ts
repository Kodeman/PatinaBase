/**
 * Single-engagement read of `document_state` (00188/00189) — the document
 * shell's source for identity + active section (§4 via the view, §13 Slice 2).
 *
 * The id accepts ANY of the engagement's keys (engagement_id / project_id /
 * proposal_id / lead_id) and canonicalizes to the view row — the resolver
 * blessed by spec §3, logged as DECISIONS.md I8. The URL is not rewritten,
 * with ONE exception (R6): an activated proposal's id resolves to a redirect
 * to `/doc/[projectId]` so pre-signing links survive the signing moment.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { DocumentStateRow } from '@/lib/document/desk-derivation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DocumentResolution =
  | { kind: 'engagement'; row: DocumentStateRow }
  | { kind: 'redirect'; projectId: string } // activated proposal id (R6)
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

      return { kind: 'missing' };
    },
  });
}
