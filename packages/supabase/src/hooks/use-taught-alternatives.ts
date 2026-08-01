'use client';

// Designer-Taught Intelligence (Schedule & Boards Wave 3 · Track A). Corpus-first
// alternatives for a rejected line / board rail (A1/B6), the accept-swap act, the
// C4 escalate-to-Decision back-link, and the training-signal log. RLS (00270/00271):
// find_taught_alternatives is SECURITY INVOKER — the caller's own products RLS
// scopes the corpus; suggestion_events is designer-own; swap / escalate are
// guarded RPCs. The alternatives query degrades silently (missing RPC / no
// embedding → []), so the band and rail simply don't show.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import {
  invalidateProposalClientQueries,
  PROPOSAL_CLIENT_MUTATION_KEY,
} from '../lib/proposal-client-query-invalidation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export interface TaughtAlternative {
  id: string;
  name: string;
  images: string[];
  price_retail: number | null;
  brand: string | null;
  source_url: string | null;
  layer: 'personal' | 'studio' | 'catalog';
  category: string | null;
  style_tags: string[] | null;
  materials: string[] | null;
  similarity: number;
}

export type SuggestionContext = 'line_alternatives' | 'board_rail';
export type SuggestionAction = 'shown' | 'accepted' | 'dismissed';

export interface SuggestionEventInput {
  context: SuggestionContext;
  action: SuggestionAction;
  productId: string;
  feedbackId?: string | null;
  boardId?: string | null;
  rank?: number | null;
}

/**
 * Corpus-first similar products for a given product (find_taught_alternatives).
 * Silent-degrade: a missing RPC or an unembedded product yields [] — the A1 band
 * and B6 rail render nothing rather than an error.
 */
export function useTaughtAlternatives(productId: string | null | undefined, limit = 8) {
  return useQuery({
    queryKey: ['taught-alternatives', productId, limit],
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TaughtAlternative[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('find_taught_alternatives', {
        p_product_id: productId,
        p_match_count: limit,
      });
      if (error) {
        if (error.message?.includes('function') || error.message?.includes('not found')) return [];
        throw error;
      }
      return (data ?? []) as TaughtAlternative[];
    },
  });
}

/**
 * Log training signals — a shown batch, a dismiss, or a board accept. Accepts one
 * row or many. designer_id is pinned to auth.uid() by the RLS INSERT policy.
 * Callers fire-and-forget (.mutate); a lost signal never blocks the act.
 */
export function useLogSuggestionEvent() {
  return useMutation({
    mutationFn: async (input: SuggestionEventInput | SuggestionEventInput[]): Promise<void> => {
      const list = Array.isArray(input) ? input : [input];
      if (list.length === 0) return;
      const rows = list.map((r) => ({
        context: r.context,
        action: r.action,
        product_id: r.productId,
        feedback_id: r.feedbackId ?? null,
        board_id: r.boardId ?? null,
        rank: r.rank ?? null,
      }));
      const supabase = getSupabase();
      const { error } = await supabase.from('suggestion_events').insert(rows);
      if (error) throw error;
    },
  });
}

/**
 * Accept a taught alternative by swapping the line to it (swap_line_to_product):
 * the line takes the product's identity + prices, keeps qty/room/doc_code, the
 * flag resolves with a swap reply, and the accepted signal is logged — one txn.
 */
export function useSwapLineToProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async (input: {
      proposalItemId: string;
      productId: string;
      feedbackId: string;
      proposalId: string;
      rank?: number | null;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('swap_line_to_product', {
        p_proposal_item_id: input.proposalItemId,
        p_product_id: input.productId,
        p_feedback_id: input.feedbackId,
        p_rank: input.rank ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_r, input) => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['proposal', input.proposalId] });
      qc.invalidateQueries({ queryKey: ['proposal-items-schedule', input.proposalId] });
      qc.invalidateQueries({ queryKey: ['scope-builder-summary', input.proposalId] });
      qc.invalidateQueries({ queryKey: ['proposal-feedback', input.proposalId] });
      qc.invalidateQueries({ queryKey: ['item-feedback-thread', input.feedbackId] });
      await invalidateProposalClientQueries(qc, input.proposalId);
    },
  });
}

/**
 * C4 back-link: after composing a client Decision from a flag, stamp
 * item_feedback.decision_id and thread the escalation event. The flag stays open.
 */
export function useEscalateFeedbackToDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { feedbackId: string; decisionId: string; proposalId: string }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('escalate_item_feedback_to_decision', {
        p_feedback_id: input.feedbackId,
        p_decision_id: input.decisionId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ['proposal-feedback', input.proposalId] });
      qc.invalidateQueries({ queryKey: ['item-feedback-thread', input.feedbackId] });
    },
  });
}
