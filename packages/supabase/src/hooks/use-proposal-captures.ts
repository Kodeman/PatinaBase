import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Json } from '../database.types';
import {
  invalidateProposalClientQueries,
  PROPOSAL_CLIENT_MUTATION_KEY,
} from '../lib/proposal-client-query-invalidation';

const getSupabase = () => createBrowserClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProposalCapture {
  id: string;
  designer_id: string;
  product_id: string | null;
  proposal_id: string | null;
  scope_room_id: string | null;
  ffe_category_slug: string | null;
  source_url: string;
  raw_payload: Record<string, unknown>;
  thumbnail_url: string | null;
  status: 'inbox' | 'assigned' | 'consumed' | 'dismissed';
  consumed_proposal_item_id: string | null;
  captured_at: string;
  consumed_at: string | null;
}

export interface UseProposalCapturesOptions {
  /**
   * Filter by capture status. Pass `'all'` to skip the status filter
   * (the default is `'inbox'`, which is what the inbox panel expects).
   */
  status?: ProposalCapture['status'] | 'all';
  /**
   * If provided, only captures whose `proposal_id` matches are returned.
   * Useful for the per-proposal CaptureInbox panel.
   */
  proposalId?: string;
}

export interface AssignCaptureInput {
  captureId: string;
  proposalId: string;
  scopeRoomId?: string;
  ffeCategorySlug?: string;
}

export interface ConsumeCaptureInput {
  captureId: string;
  proposalId: string;
  scopeRoomId: string;
  ffeCategorySlug: string;
  qty?: number;
}

export interface ConsumeCaptureResult {
  proposalItemId: string;
}

export interface DismissCaptureInput {
  captureId: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * List the current designer's captures, optionally filtered by status and/or
 * proposal. RLS confines the result to `designer_id = auth.uid()`.
 */
export function useProposalCaptures(options: UseProposalCapturesOptions = {}) {
  const { status = 'inbox', proposalId } = options;

  return useQuery({
    queryKey: ['proposal-captures', status, proposalId ?? null],
    queryFn: async (): Promise<ProposalCapture[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('proposal_captures')
        .select('*')
        .order('captured_at', { ascending: false });

      if (status !== 'all') {
        query = query.eq('status', status);
      }
      if (proposalId) {
        query = query.eq('proposal_id', proposalId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ProposalCapture[];
    },
  });
}

/**
 * Assign a capture to a proposal (and optionally a room/category) without
 * consuming it. Captures whose proposal/room/category are all set transition
 * to status='assigned'; otherwise they stay 'inbox'.
 */
export function useAssignCapture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AssignCaptureInput): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const nextStatus =
        input.proposalId && input.scopeRoomId && input.ffeCategorySlug
          ? 'assigned'
          : 'inbox';

      const { error } = await supabase
        .from('proposal_captures')
        .update({
          proposal_id: input.proposalId,
          scope_room_id: input.scopeRoomId ?? null,
          ffe_category_slug: input.ffeCategorySlug ?? null,
          status: nextStatus,
        })
        .eq('id', input.captureId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-captures'] });
    },
  });
}

/**
 * Transactionally consume a capture: insert a `proposal_items` row
 * (item_type='fixed') and stamp the capture as consumed. Wraps the
 * `consume_capture` RPC defined in migration 00130.
 */
export function useConsumeCapture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async (input: ConsumeCaptureInput): Promise<ConsumeCaptureResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('consume_capture', {
        p_capture_id: input.captureId,
        p_proposal_id: input.proposalId,
        p_scope_room_id: input.scopeRoomId,
        p_ffe_category_slug: input.ffeCategorySlug,
        p_qty: input.qty ?? 1,
      });

      if (error) throw error;
      // The RPC returns a UUID directly.
      return { proposalItemId: data as string };
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-captures'] });
      queryClient.invalidateQueries({ queryKey: ['proposal-items-schedule', variables.proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal', variables.proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', variables.proposalId] });
      await invalidateProposalClientQueries(queryClient, variables.proposalId);
    },
  });
}

/**
 * Payload envelope for `commit_proposal_capture` (migration 00516,
 * Phase 3 / C-A2). Mirrors the extension's `buildCommitProposalCaptureArgs`
 * (apps/extension/src/lib/payloads.ts) — see that RPC's docstring in 00516
 * for the exact field-by-field mapping onto the `products` insert.
 */
export interface CommitProposalCapturePayload {
  name?: string | null;
  description?: string | null;
  sourceUrl: string;
  images?: string[];
  priceRetailCents?: number | null;
  materials?: string[];
  colors?: string[];
  finish?: string | null;
  availableColors?: string[];
  vendorId?: string | null;
  retailerId?: string | null;
  captureSource?: 'web_extension' | 'portal' | 'manual' | 'import';
  captureProvenance?: Record<string, unknown>;
  productStatus?: 'draft' | 'published';
  thumbnailUrl?: string | null;
  /** Stored verbatim as proposal_captures.raw_payload — the small
   *  display-oriented snapshot callers already compute. */
  rawPayload?: Record<string, unknown>;
}

export interface CommitProposalCaptureInput {
  /** Client-generated idempotency key — mint once per logical capture and
   *  reuse on every retry (never a fresh id per attempt). */
  clientCaptureId: string;
  payload: CommitProposalCapturePayload;
  styleIds?: string[];
  proposalId?: string | null;
  scopeRoomId?: string | null;
  ffeCategorySlug?: string | null;
}

export interface CommitProposalCaptureResult {
  captureId: string;
  productId: string;
  status: ProposalCapture['status'];
  created: boolean;
  enrichmentRunId: string | null;
}

/**
 * Idempotent upsert of a proposal_captures inbox row + its draft product
 * (+ styles), keyed on `clientCaptureId`. Wraps `commit_proposal_capture`
 * (migration 00516) — the single-RPC replacement for the old
 * products -> product_styles -> proposal_captures insert sequence.
 * Retrying with the SAME clientCaptureId is always safe: it returns the
 * same capture/product ids and never double-commits.
 */
export function useCommitProposalCapture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CommitProposalCaptureInput): Promise<CommitProposalCaptureResult> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('commit_proposal_capture', {
        p_client_capture_id: input.clientCaptureId,
        p_payload: input.payload as unknown as Json,
        p_style_ids: input.styleIds ?? undefined,
        p_proposal_id: input.proposalId ?? undefined,
        p_scope_room_id: input.scopeRoomId ?? undefined,
        p_ffe_category_slug: input.ffeCategorySlug ?? undefined,
      });
      if (error) throw error;

      const result = data as unknown as {
        capture_id: string;
        product_id: string;
        status: ProposalCapture['status'];
        created: boolean;
        enrichment_run_id: string | null;
      };
      return {
        captureId: result.capture_id,
        productId: result.product_id,
        status: result.status,
        created: result.created,
        enrichmentRunId: result.enrichment_run_id ?? null,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-captures'] });
      queryClient.invalidateQueries({ queryKey: ['layer-products', 'personal'] });
      queryClient.invalidateQueries({ queryKey: ['layer-counts'] });
    },
  });
}

/**
 * Mark a capture as dismissed. Hidden from inbox queries but the row
 * is preserved for audit + analytics.
 */
export function useDismissCapture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DismissCaptureInput): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase
        .from('proposal_captures')
        .update({ status: 'dismissed' })
        .eq('id', input.captureId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-captures'] });
    },
  });
}
