'use client';

// Internal direction layer on board pins (board-paths W3c, DV6). A studio
// lead directing a junior on a specific pin — distinct from item_feedback
// (00267), which is the CLIENT verdict loop. RLS (00550):
// can_manage_board_item_feedback(board_item_id) — a studio co-member of the
// board's owner reads/writes every note; a client or guest reads nothing (no
// policy, no grant names anon or a client-facing role). Resolve/reopen go
// through SECURITY DEFINER RPCs so resolved_at/resolved_by are always
// server-set, mirroring resolve_item_feedback/reopen_item_feedback.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export interface BoardItemDirection {
  id: string;
  board_item_id: string;
  author_id: string;
  body: string;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

const DIRECTION_COLUMNS =
  'id, board_item_id, author_id, body, resolved, resolved_at, resolved_by, created_at, updated_at';

/**
 * Every direction note on ONE board's pins, scoped by `board_id` (owner-
 * agnostic — works for both a proposal-owned and a project-owned board, same
 * shape as useBoardItemFeedbackByBoard). Feeds both the per-pin unresolved
 * indicator (group by board_item_id, count where !resolved) and the
 * inspector's thread view (filter to the selected pin) from one read.
 */
export function useBoardItemDirectionsByBoard(boardId: string | undefined) {
  return useQuery({
    queryKey: ['board-item-directions', boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<BoardItemDirection[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('board_item_directions')
        .select(`${DIRECTION_COLUMNS}, proposal_board_items!inner(board_id)`)
        .eq('proposal_board_items.board_id', boardId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BoardItemDirection[];
    },
  });
}

/** Count of pins on this board carrying at least one unresolved direction
 * note — the population for the pin indicator. Derived client-side from the
 * same board-scoped read rather than a second query. */
export function countUnresolvedDirectionsByItem(
  directions: readonly BoardItemDirection[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const direction of directions) {
    if (direction.resolved) continue;
    counts.set(direction.board_item_id, (counts.get(direction.board_item_id) ?? 0) + 1);
  }
  return counts;
}

/** A studio co-member adds a direction note to a pin's thread. author_id is
 * DB-defaulted to auth.uid(); never sent (RLS also requires it match). */
export function useAddBoardItemDirection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: string;
      boardItemId: string;
      body: string;
    }): Promise<BoardItemDirection> => {
      const body = input.body.trim();
      if (!body) throw new Error('A direction note needs a body.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('board_item_directions')
        .insert({ board_item_id: input.boardItemId, body })
        .select(DIRECTION_COLUMNS)
        .single();
      if (error) throw error;
      return data as BoardItemDirection;
    },
    onSuccess: (_result, input) => {
      qc.invalidateQueries({ queryKey: ['board-item-directions', input.boardId] });
    },
  });
}

/** A studio co-member marks a direction note handled. */
export function useResolveBoardItemDirection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: string;
      directionId: string;
    }): Promise<BoardItemDirection> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('resolve_board_item_direction', {
        p_direction_id: input.directionId,
      });
      if (error) throw error;
      return data as BoardItemDirection;
    },
    onSuccess: (_result, input) => {
      qc.invalidateQueries({ queryKey: ['board-item-directions', input.boardId] });
    },
  });
}

/** A studio co-member reopens a previously resolved direction note. */
export function useReopenBoardItemDirection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: string;
      directionId: string;
    }): Promise<BoardItemDirection> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('reopen_board_item_direction', {
        p_direction_id: input.directionId,
      });
      if (error) throw error;
      return data as BoardItemDirection;
    },
    onSuccess: (_result, input) => {
      qc.invalidateQueries({ queryKey: ['board-item-directions', input.boardId] });
    },
  });
}
