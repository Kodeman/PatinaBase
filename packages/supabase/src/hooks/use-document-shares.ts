'use client';

// Document share links (Schedule & Boards Wave 2 · C2). Designer-only CRUD over
// tokenized, revocable, view-only share links to a proposal's client copy. All
// paths go through the SECURITY DEFINER RPCs (00266) — the raw token is returned
// exactly once by create; only sha256(token) is ever stored.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { ShareVisibility } from '@patina/utils';

const getSupabase = () => createBrowserClient();

export interface DocumentShare {
  id: string;
  proposal_id: string | null;
  board_id: string | null;
  label: string | null;
  visibility: ShareVisibility;
  status: 'active' | 'revoked';
  expires_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
}

export interface CreatedShare {
  id: string;
  /** The raw token — shown once, never persisted. */
  token: string;
}

/** All share links on a proposal, newest first (designer-only via RLS). */
export function useProposalShares(proposalId: string | undefined) {
  return useQuery({
    queryKey: ['proposal-shares', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<DocumentShare[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('document_shares')
        .select('id, proposal_id, board_id, label, visibility, status, expires_at, view_count, last_viewed_at, created_at')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentShare[];
    },
  });
}

/** All view-only share links for one board, newest first. */
export function useBoardShares(boardId: string | undefined) {
  return useQuery({
    queryKey: ['board-shares', boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<DocumentShare[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('document_shares')
        .select('id, proposal_id, board_id, label, visibility, status, expires_at, view_count, last_viewed_at, created_at')
        .eq('board_id', boardId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentShare[];
    },
  });
}

export function useCreateShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      proposalId: string;
      label?: string | null;
      visibility: ShareVisibility;
      expiresAt?: string | null;
    }): Promise<CreatedShare> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('create_document_share', {
        p_proposal_id: input.proposalId,
        p_label: input.label ?? null,
        p_visibility: input.visibility,
        p_expires_at: input.expiresAt ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { id: row.id, token: row.token };
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ['proposal-shares', input.proposalId] });
    },
  });
}

/** Mint a board-only token. The raw token is returned once and never cached. */
export function useCreateBoardShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: string;
      label?: string | null;
      expiresAt?: string | null;
    }): Promise<CreatedShare> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('create_board_share', {
        p_board_id: input.boardId,
        p_label: input.label ?? null,
        p_expires_at: input.expiresAt ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.id || !row?.token) throw new Error('Board share could not be created.');
      return { id: row.id, token: row.token };
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ['board-shares', input.boardId] });
    },
  });
}

/**
 * Bulk existence check: which of these board ids currently have an ACTIVE
 * share link. Backs the board-level reaction-status chip and the desk rollup
 * (board-paths W2b) — a single IN() read instead of one useBoardShares call
 * per card. Exported as a plain async fetcher too, so a caller that already
 * has a board list can fold it into one larger query instead of a second
 * React Query round trip.
 */
export async function fetchActiveBoardShareIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  boardIds: readonly string[],
): Promise<Set<string>> {
  if (boardIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('document_shares')
    .select('board_id')
    .in('board_id', boardIds)
    .eq('status', 'active');
  if (error) throw error;
  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ board_id: string | null }>) {
    if (typeof row.board_id === 'string') ids.add(row.board_id);
  }
  return ids;
}

export function useActiveBoardShareIds(boardIds: readonly string[]) {
  const sortedIds = [...new Set(boardIds)].sort();
  return useQuery({
    queryKey: ['active-board-share-ids', sortedIds],
    enabled: sortedIds.length > 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchActiveBoardShareIds(getSupabase() as any, sortedIds),
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      shareId: string;
      proposalId?: string;
      boardId?: string;
    }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('revoke_document_share', { p_share_id: input.shareId });
      if (error) throw error;
    },
    onSuccess: (_r, input) => {
      if (input.proposalId) {
        qc.invalidateQueries({ queryKey: ['proposal-shares', input.proposalId] });
      }
      if (input.boardId) {
        qc.invalidateQueries({ queryKey: ['board-shares', input.boardId] });
      }
    },
  });
}
