'use client';

import { useQuery } from '@tanstack/react-query';
import type { BoardOwnerRef } from '@patina/types';
import { createBrowserClient } from '../client';
import { summarizeBoardCoverUrls } from './use-boards';
import {
  summarizeBoardVerdicts,
  type BoardItemVerdictProjection,
  type BoardVerdictCounts,
} from './board-verdicts';

const getSupabase = () => createBrowserClient();

export interface RecentBoard {
  id: string;
  name: string;
  owner: BoardOwnerRef;
  ownerName: string;
  roomName: string | null;
  coverImageUrl: string | null;
  coverFallbackUrls: string[];
  verdictCounts: BoardVerdictCounts;
  updatedAt: string;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * RLS-scoped, owner-unified recent boards for Desk and command surfaces. The
 * compact nested feedback projection supplies cover-card verdict counts in the
 * same round trip; item_feedback policies remain the access boundary.
 */
export function useRecentBoards(limit = 8) {
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit) || 8));
  return useQuery({
    queryKey: ['recent-boards', safeLimit],
    queryFn: async (): Promise<RecentBoard[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_boards')
        .select(
          'id, name, proposal_id, project_id, cover_image_url, updated_at, proposal:proposals(title), project:projects(name), room:proposal_scope_rooms(name), proposal_board_items(image_url, data, z_index, verdicts:item_feedback!item_feedback_board_item_id_fkey(id, client_id, verdict, created_at))',
        )
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(safeLimit);
      if (error) throw error;

      return ((data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
        const proposalId = typeof row.proposal_id === 'string' ? row.proposal_id : null;
        const projectId = typeof row.project_id === 'string' ? row.project_id : null;
        if ((proposalId ? 1 : 0) + (projectId ? 1 : 0) !== 1) return [];
        const proposal = firstRelation(row.proposal as { title?: unknown } | null);
        const project = firstRelation(row.project as { name?: unknown } | null);
        const room = firstRelation(row.room as { name?: unknown } | null);
        const owner: BoardOwnerRef = proposalId
          ? { kind: 'proposal', id: proposalId }
          : { kind: 'project', id: projectId! };
        const ownerName = proposalId
          ? typeof proposal?.title === 'string' && proposal.title.trim()
            ? proposal.title
            : 'Draft proposal'
          : typeof project?.name === 'string' && project.name.trim()
            ? project.name
            : 'Project';
        const boardItems = (row.proposal_board_items ?? []) as Array<
          BoardItemVerdictProjection & { image_url?: unknown; data?: unknown; z_index?: unknown }
        >;
        return [{
          id: String(row.id),
          name: String(row.name),
          owner,
          ownerName,
          roomName: typeof room?.name === 'string' ? room.name : null,
          coverImageUrl: typeof row.cover_image_url === 'string' ? row.cover_image_url : null,
          coverFallbackUrls: summarizeBoardCoverUrls(boardItems),
          verdictCounts: summarizeBoardVerdicts(boardItems),
          updatedAt: String(row.updated_at),
        }];
      });
    },
  });
}
