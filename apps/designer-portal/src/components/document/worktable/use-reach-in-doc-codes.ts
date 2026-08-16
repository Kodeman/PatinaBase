'use client';

/**
 * The reach-in's doc-code read, on its OWN query key (W3 review, F1).
 *
 * The FF&E builder's full read (`select('*')`, ffe-schedule-builder's local
 * useProposalItems) and the shared slim projection (`useProposalScheduleItems`,
 * packages/supabase) both observe `['proposal-items-schedule', proposalId]`
 * with DIFFERENT queryFns. The Speccing table co-mounts the builder and the
 * reach-in, and in TanStack v5 the last-rendered observer's queryFn owns the
 * query — a refetch after an add could hand the builder the slim rows (no
 * position, prices, quantities) and collapse the schedule. So the reach-in
 * reads the one column it needs under a distinct ROOT key that no shared
 * invalidation prefix touches, and the reach-in refreshes it itself after
 * each add (LibraryReachIn invalidates `reachInDocCodesKey` in handleAdd).
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

export const reachInDocCodesKey = (proposalId: string) =>
  ['reach-in-doc-codes', proposalId] as const;

/** Every line's doc_code on the proposal, nulls included — the taken set. */
export function useReachInDocCodes(proposalId: string) {
  return useQuery({
    queryKey: reachInDocCodesKey(proposalId),
    enabled: !!proposalId,
    queryFn: async (): Promise<Array<string | null>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { data, error } = await supabase
        .from('proposal_items')
        .select('doc_code')
        .eq('proposal_id', proposalId)
        .order('position', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<{ doc_code: string | null }>).map(
        (row) => row.doc_code,
      );
    },
  });
}
