/**
 * Desk data hook — reads the `document_state` view (00188) and derives the
 * two Desk populations. Portal-local like use-time-tracking.ts.
 *
 * 60s refetch = the Desk "re-sorts in the background" (D2) without any
 * push/toast machinery. The view is not in the generated database.types.ts
 * yet, so the client is cast like the other portal hooks.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import {
  partitionDesk,
  type DeskFolder,
  type DocumentStateRow,
  type MotionChip,
} from '@/lib/document/desk-derivation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export interface DeskData {
  folders: DeskFolder[];
  chips: MotionChip[];
}

export function useDeskEngagements() {
  return useQuery<DeskData>({
    queryKey: ['document-state', 'desk'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('document_state')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return partitionDesk((data ?? []) as DocumentStateRow[], new Date());
    },
  });
}
