import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-captures'] });
      queryClient.invalidateQueries({ queryKey: ['proposal-items-schedule', variables.proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal', variables.proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', variables.proposalId] });
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
