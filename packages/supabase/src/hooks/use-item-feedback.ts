'use client';

// Per-line client verdicts (Schedule & Boards Wave 2 · C3). Approve / flag / note
// on a single proposal line, plus a short thread. A verdict NEVER mutates the
// line — it is commentary with a state chip. RLS (00267): the client writes/reads
// her own; the designer reads every verdict on their document; resolve/reopen are
// designer-only RPCs; replies are open to either party.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Verdict } from '@patina/utils';

const getSupabase = () => createBrowserClient();

export type { Verdict };

export interface ItemFeedback {
  id: string;
  proposal_item_id: string | null;
  ffe_item_id: string | null;
  board_item_id: string | null;
  client_id: string;
  verdict: Verdict;
  body: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  // Set when the designer escalates this flag to a client Decision (Wave 3 · C4).
  decision_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemFeedbackEvent {
  id: string;
  feedback_id: string;
  actor: string;
  kind: 'created' | 'replied' | 'resolved' | 'reopened';
  body: string | null;
  created_at: string;
}

/**
 * Every proposal-line verdict on a proposal (via the proposal_items FK). RLS
 * scopes rows: the designer sees all on their doc, the client sees her own.
 * Board-anchored verdicts are excluded here (this is the proposal-line feed).
 */
export function useProposalFeedback(proposalId: string | undefined) {
  return useQuery({
    queryKey: ['proposal-feedback', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<ItemFeedback[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('item_feedback')
        .select('id, proposal_item_id, ffe_item_id, board_item_id, client_id, verdict, body, resolved_at, resolved_by, decision_id, created_at, updated_at, proposal_items!inner(proposal_id)')
        .eq('proposal_items.proposal_id', proposalId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemFeedback[];
    },
  });
}

/** Authenticated client proposal-line feed through the client-safe RPC. */
export function useClientProposalFeedback(proposalId: string | undefined) {
  return useQuery({
    queryKey: ['proposal-feedback', proposalId, 'client-safe'],
    enabled: !!proposalId,
    queryFn: async (): Promise<ItemFeedback[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc(
        'get_client_proposal_feedback',
        { p_proposal_id: proposalId, p_board_items: false },
      );
      if (error) throw error;
      return (data ?? []) as ItemFeedback[];
    },
  });
}

/**
 * Every BOARD-PIN verdict on a proposal (via proposal_board_items →
 * proposal_boards → proposal_id). The proposal-line feed above excludes board
 * anchors (its `!inner` join is on proposal_items), so this is the parallel
 * board feed (B4). Same 00267 RLS: designer sees all, client sees her own.
 */
export function useBoardFeedback(proposalId: string | undefined) {
  return useQuery({
    queryKey: ['board-feedback', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<ItemFeedback[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('item_feedback')
        .select('id, proposal_item_id, ffe_item_id, board_item_id, client_id, verdict, body, resolved_at, resolved_by, created_at, updated_at, proposal_board_items!inner(board_id, proposal_boards!inner(proposal_id))')
        .eq('proposal_board_items.proposal_boards.proposal_id', proposalId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemFeedback[];
    },
  });
}

/**
 * Every BOARD-PIN verdict on a specific board, scoped directly by `board_id`
 * rather than a proposal leg (board-paths W2b). useBoardFeedback above requires
 * a proposal_id and returns nothing for a project-owned board (proposal_boards
 * with `project_id` set) — this is the owner-agnostic parallel, since a board's
 * items live in `proposal_board_items` regardless of which leg owns the board.
 * Same 00267 RLS: designer sees every verdict on their board, a client sees
 * her own.
 */
export function useBoardItemFeedbackByBoard(boardId: string | undefined) {
  return useQuery({
    queryKey: ['board-item-feedback', boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<ItemFeedback[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('item_feedback')
        .select('id, proposal_item_id, ffe_item_id, board_item_id, client_id, verdict, body, resolved_at, resolved_by, created_at, updated_at, proposal_board_items!inner(board_id)')
        .eq('proposal_board_items.board_id', boardId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemFeedback[];
    },
  });
}

/** Authenticated client board-pin feed through the client-safe RPC. */
export function useClientBoardFeedback(proposalId: string | undefined) {
  return useQuery({
    queryKey: ['board-feedback', proposalId, 'client-safe'],
    enabled: !!proposalId,
    queryFn: async (): Promise<ItemFeedback[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc(
        'get_client_proposal_feedback',
        { p_proposal_id: proposalId, p_board_items: true },
      );
      if (error) throw error;
      return (data ?? []) as ItemFeedback[];
    },
  });
}

/** The thread (created / replied / resolved / reopened) on one verdict. */
export function useItemFeedbackThread(feedbackId: string | undefined) {
  return useQuery({
    queryKey: ['item-feedback-thread', feedbackId],
    enabled: !!feedbackId,
    queryFn: async (): Promise<ItemFeedbackEvent[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('item_feedback_events')
        .select('*')
        .eq('feedback_id', feedbackId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemFeedbackEvent[];
    },
  });
}

/**
 * Client leaves a verdict on a line OR a board pin (INSERT; the 00267 trigger
 * writes the thread + notify for any anchor). Pass EXACTLY ONE of proposalItemId
 * / boardItemId — the anchor CHECK (00267) enforces it. `client_id` is
 * DB-defaulted to auth.uid(); never sent.
 */
export function useSubmitVerdict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      proposalId: string;
      proposalItemId?: string;
      boardItemId?: string;
      verdict: Verdict;
      body?: string | null;
    }): Promise<ItemFeedback> => {
      if (input.verdict === 'comment' && !input.body?.trim()) {
        throw new Error('Add a note before submitting.');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const anchor = input.boardItemId
        ? { board_item_id: input.boardItemId }
        : { proposal_item_id: input.proposalItemId };
      const { data, error } = await supabase
        .from('item_feedback')
        .insert({ ...anchor, verdict: input.verdict, body: input.body ?? null })
        .select('id, proposal_item_id, ffe_item_id, board_item_id, client_id, verdict, body, resolved_at, resolved_by, created_at, updated_at')
        .single();
      if (error) throw error;
      return data as ItemFeedback;
    },
    onSuccess: (_r, input) => {
      // Refresh whichever feed the anchor belongs to (both are cheap).
      qc.invalidateQueries({ queryKey: ['proposal-feedback', input.proposalId] });
      qc.invalidateQueries({ queryKey: ['board-feedback', input.proposalId] });
    },
  });
}

/** Either party adds a reply to a verdict's thread. */
export function useReplyToItemFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { feedbackId: string; body: string; proposalId?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('reply_to_item_feedback', {
        p_feedback_id: input.feedbackId,
        p_body: input.body,
      });
      if (error) throw error;
      return data as ItemFeedbackEvent;
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ['item-feedback-thread', input.feedbackId] });
      if (input.proposalId) qc.invalidateQueries({ queryKey: ['proposal-feedback', input.proposalId] });
    },
  });
}

/** Designer marks a flag handled (or reopens it). Never touches the line. */
export function useResolveFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { feedbackId: string; proposalId: string; reopen?: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const fn = input.reopen ? 'reopen_item_feedback' : 'resolve_item_feedback';
      const { data, error } = await supabase.rpc(fn, { p_feedback_id: input.feedbackId });
      if (error) throw error;
      return data as ItemFeedback;
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ['proposal-feedback', input.proposalId] });
      qc.invalidateQueries({ queryKey: ['item-feedback-thread', input.feedbackId] });
    },
  });
}
