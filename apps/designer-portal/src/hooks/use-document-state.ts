/**
 * Single-engagement read of `document_state` (00188) — the document shell's
 * source for identity + active section (§4 via the view, §13 Slice 2).
 *
 * The id accepts ANY of the engagement's keys (engagement_id / project_id /
 * proposal_id / lead_id) and canonicalizes to the view row — the resolver
 * blessed by spec §3, logged as DECISIONS.md I8. The URL is not rewritten.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { DocumentStateRow } from '@/lib/document/desk-derivation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useDocumentEngagement(id: string) {
  return useQuery<DocumentStateRow | null>({
    queryKey: ['document-state', 'engagement', id],
    enabled: UUID_RE.test(id),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('document_state')
        .select('*')
        .or(`engagement_id.eq.${id},project_id.eq.${id},proposal_id.eq.${id},lead_id.eq.${id}`)
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as DocumentStateRow) ?? null;
    },
  });
}
