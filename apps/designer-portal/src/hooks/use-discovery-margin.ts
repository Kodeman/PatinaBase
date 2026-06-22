/**
 * The Discovery margin (R66) — notes only.
 *
 * At the Discovery stage (document_state Shape D) there is no project or
 * proposal, so the shared `margin_items` view (project/proposal-keyed) does
 * not reach it. The Note is the ONLY margin kind possible pre-project, so the
 * Discovery margin reads relationship-keyed notes directly from `margin_notes`
 * and maps them to the same MarginItemRow shape the view's note branch emits
 * (00197/00206) — same Note rendering, same RLS (designer-scoped), no
 * structured facts (R66's load-bearing split: tone lives here, facts in the
 * blocks).
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { MarginItemRow } from '@/lib/document/margin-derivation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

interface MarginNoteRow {
  id: string;
  body: string;
  anchor_kind: 'line' | 'section' | 'letterhead' | null;
  anchor_id: string | null;
  due_date: string | null;
  escalated_to_decision_id: string | null;
  escalated_to_scope_change_id: string | null;
  updated_at: string;
}

/** Mirror the view's note branch (00197/00206) state derivation. */
function noteState(n: MarginNoteRow, now: number): string {
  if (n.escalated_to_decision_id || n.escalated_to_scope_change_id) return 'escalated';
  if (n.due_date && new Date(n.due_date).getTime() <= now) return 'due';
  return 'open';
}

export function useDiscoveryMarginNotes(designerClientId: string | null) {
  return useQuery<MarginItemRow[]>({
    queryKey: ['discovery-margin', designerClientId],
    enabled: Boolean(designerClientId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('margin_notes')
        .select(
          'id, body, anchor_kind, anchor_id, due_date, escalated_to_decision_id, escalated_to_scope_change_id, updated_at'
        )
        .eq('designer_client_id', designerClientId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const now = Date.now();
      return ((data ?? []) as MarginNoteRow[]).map((n) => ({
        kind: 'note' as const,
        item_id: n.id,
        project_id: null,
        proposal_id: null,
        anchor_kind: n.anchor_kind ?? 'letterhead',
        anchor_id: n.anchor_id,
        state: noteState(n, now),
        title: n.body.slice(0, 80),
        detail: '',
        ts: n.due_date ?? n.updated_at,
        payload: {
          due_date: n.due_date,
          escalated_to_decision_id: n.escalated_to_decision_id,
          escalated_to_scope_change_id: n.escalated_to_scope_change_id,
        },
      }));
    },
  });
}
