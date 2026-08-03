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
