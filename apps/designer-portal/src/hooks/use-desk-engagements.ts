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
import { createBrowserClient } from '@patina/supabase';
import {
  partitionDesk,
  type DeskFolder,
  type DocumentStateRow,
  type MotionChip,
} from '@/lib/document/desk-derivation';
import { buildDeskConflicts } from '@/lib/document/desk-conflicts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export interface DeskData {
  folders: DeskFolder[];
  chips: MotionChip[];
}

/** Conflict window: today → +120d covers any configured install horizon. */
const CONFLICT_WINDOW_DAYS = 120;

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
      const [{ data, error }, { data: events, error: eventsError }] = await Promise.all([
        supabase.from('document_state').select('*').order('updated_at', { ascending: false }),
        supabase
          .from('delivery_events')
          .select('*')
          .gte('event_date', today)
          .lte('event_date', horizon),
      ]);
      if (error) throw error;
      // The Desk never dies on the calendar feed — conflicts just stay quiet.
      const conflicts = eventsError ? undefined : buildDeskConflicts(events ?? []);
      return partitionDesk((data ?? []) as DocumentStateRow[], new Date(), conflicts);
    },
  });
}
