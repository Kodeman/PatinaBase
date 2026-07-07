/**
 * Desk data hook — reads the `document_state` view (00188) and derives the
 * two Desk populations. Portal-local like use-time-tracking.ts.
 *
 * 60s refetch = the Desk "re-sorts in the background" (D2) without any
 * push/toast machinery. The view is not in the generated database.types.ts
 * yet, so the client is cast like the other portal hooks.
 *
 * R28: the same fetch reads `delivery_events` (00150) and classifies
 * schedule conflicts client-side (the Wave 2.1 precedent) — collisions rise
 * as need lines, drift rides the in-motion chips. One derivation cycle: the
 * next 60s tick re-reads both sources together.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient, type Invoice } from '@patina/supabase';
import {
  partitionDesk,
  type DeskFolder,
  type DocumentStateRow,
  type MotionChip,
} from '@/lib/document/desk-derivation';
import { buildDeskConflicts } from '@/lib/document/desk-conflicts';
import { buildDeskReceivables } from '@/lib/document/desk-receivables';
import {
  buildDeskFlaggedLines,
  type FlaggedLineRow,
} from '@/lib/document/desk-flagged-lines';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export interface DeskData {
  folders: DeskFolder[];
  chips: MotionChip[];
}

/** Conflict window: today → +120d covers any configured install horizon. */
const CONFLICT_WINDOW_DAYS = 120;

/** Flatten the item_feedback→proposal_items→proposals embed into the flagged-row
 *  shape buildDeskFlaggedLines reads. Tolerant of PostgREST returning a to-one
 *  embed as either an object or a single-element array. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenFlaggedRows(rows: any): FlaggedLineRow[] {
  if (!Array.isArray(rows)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  return rows
    .map((r) => {
      const pi = one(r?.proposal_items);
      const proposal = one(pi?.proposals);
      return {
        proposalId: pi?.proposal_id as string,
        proposalTitle: (proposal?.title ?? null) as string | null,
      };
    })
    .filter((r) => !!r.proposalId);
}

export function useDeskEngagements() {
  return useQuery<DeskData>({
    queryKey: ['document-state', 'desk'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const supabase = getSupabase();
      const today = new Date().toISOString().slice(0, 10);
      const horizon = new Date(Date.now() + CONFLICT_WINDOW_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const [
        { data, error },
        { data: events, error: eventsError },
        { data: invoices, error: invoicesError },
        { data: flaggedFeedback, error: flaggedError },
      ] = await Promise.all([
        supabase.from('document_state').select('*').order('updated_at', { ascending: false }),
        supabase
          .from('delivery_events')
          .select('*')
          .gte('event_date', today)
          .lte('event_date', horizon),
        // R36: open receivables for the overdue → Desk need line. Just the
        // columns the classifier needs (RLS scopes to the designer's invoices).
        supabase
          .from('invoices')
          .select(
            'id, project_id, status, due_date, total_cents, amount_paid_cents, invoice_number, ar_last_chased_at',
          )
          .in('status', ['sent', 'partially_paid']),
        // C4: unresolved per-line client rejections → the "N lines flagged" need.
        // RLS scopes item_feedback to the designer's own proposals; the inner
        // join carries the proposal id + title for the need line. (Same join the
        // proposal-feedback hook uses, so the relationship names are proven.)
        supabase
          .from('item_feedback')
          .select('proposal_items!inner(proposal_id, proposals!inner(title))')
          .eq('verdict', 'rejected')
          .is('resolved_at', null),
      ]);
      if (error) throw error;
      const now = new Date();
      // The Desk never dies on a side feed — conflicts/receivables/flags stay quiet.
      const conflicts = eventsError ? undefined : buildDeskConflicts(events ?? []);
      const receivables = invoicesError
        ? undefined
        : buildDeskReceivables((invoices ?? []) as Invoice[], now);
      const flaggedLines = flaggedError
        ? undefined
        : buildDeskFlaggedLines(flattenFlaggedRows(flaggedFeedback));
      return partitionDesk(
        (data ?? []) as DocumentStateRow[],
        now,
        conflicts,
        receivables,
        flaggedLines,
      );
    },
  });
}
