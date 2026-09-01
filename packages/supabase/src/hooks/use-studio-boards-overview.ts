'use client';

// Studio-wide boards status view (board-paths W3c, DV8/DV10). Builds on the
// desk rollup's derivation helpers (board-verdicts.ts) and cap pattern
// (use-board-reaction-rollup.ts): a bounded, RLS-scoped read of every active
// board across projects — with cover, project/proposal name, reaction-status
// chip, client/guest verdict split, and unresolved-direction count (00550).
// This is the destination the desk rollup's count-links now point at; see
// desk-boards-reaction-rollup.tsx.

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { fetchActiveBoardShareIds } from './use-document-shares';
import {
  deriveBoardReactionStatus,
  summarizeBoardVerdicts,
  type BoardItemVerdictProjection,
  type BoardReactionStatus,
  type BoardVerdictBreakdown,
} from './board-verdicts';

const getSupabase = () => createBrowserClient();

const DEFAULT_CAP = 60;
const MAX_CAP = 150;

export interface StudioBoardOverviewEntry {
  id: string;
  name: string;
  ownerKind: 'proposal' | 'project';
  ownerId: string;
  ownerName: string;
  coverImageUrl: string | null;
  updatedAt: string;
  reactionStatus: BoardReactionStatus | null;
  verdicts: BoardVerdictBreakdown;
  /** Count of unresolved internal direction notes across this board's pins
   * (board-paths W3c, DV6) — studio-only, never a client/guest figure. */
  unresolvedDirectionCount: number;
}

export interface StudioBoardsOverview {
  boards: StudioBoardOverviewEntry[];
  /** True when more active boards exist than this bounded read returned. */
  capped: boolean;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * The studio's active boards across every project/proposal, newest-updated
 * first, each folded down to the exact fields DV8/DV10 asked for: a cover, an
 * owner name, the same reaction-status chip the per-board card uses, the
 * client/guest verdict split (summarizeBoardVerdicts.bySource), and how many
 * unresolved direction notes it carries. Bounded — never an unbounded
 * all-boards scan; `capped` tells the caller when the read stopped short.
 */
export function useStudioBoardsOverview(cap = DEFAULT_CAP) {
  const safeCap = Math.max(1, Math.min(MAX_CAP, Math.trunc(cap) || DEFAULT_CAP));
  return useQuery({
    queryKey: ['studio-boards-overview', safeCap],
    queryFn: async (): Promise<StudioBoardsOverview> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_boards')
        .select(
          'id, name, proposal_id, project_id, updated_at, cover_image_url, ' +
            'proposal:proposals(title), project:projects(name), ' +
            'proposal_board_items(' +
            'verdicts:item_feedback!item_feedback_board_item_id_fkey(id, client_id, guest_share_id, verdict, created_at), ' +
            'directions:board_item_directions(id, resolved)' +
            ')',
        )
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        // One extra row over the cap is the cheapest way to know whether more
        // active boards exist without a separate count query.
        .limit(safeCap + 1);
      if (error) throw error;

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const capped = rows.length > safeCap;
      const boardRows = capped ? rows.slice(0, safeCap) : rows;
      const boardIds = boardRows.map((row) => String(row.id));
      const activeShareIds = await fetchActiveBoardShareIds(supabase, boardIds);

      const boards: StudioBoardOverviewEntry[] = boardRows.map((row) => {
        const id = String(row.id);
        const proposalId = typeof row.proposal_id === 'string' ? row.proposal_id : null;
        const projectId = typeof row.project_id === 'string' ? row.project_id : null;
        const proposal = firstRelation(row.proposal as { title?: unknown } | null);
        const project = firstRelation(row.project as { name?: unknown } | null);
        const ownerKind: 'proposal' | 'project' = proposalId ? 'proposal' : 'project';
        const ownerId = proposalId ?? projectId ?? '';
        const ownerName = proposalId
          ? (typeof proposal?.title === 'string' && proposal.title.trim() ? proposal.title : 'Draft proposal')
          : (typeof project?.name === 'string' && project.name.trim() ? project.name : 'Project');

        const items = (row.proposal_board_items ?? []) as Array<
          BoardItemVerdictProjection & { directions?: Array<{ id: string; resolved: boolean }> | null }
        >;
        const verdicts = summarizeBoardVerdicts(items);
        const reactionStatus = deriveBoardReactionStatus({
          verdictCounts: verdicts,
          hasActiveShare: activeShareIds.has(id),
        });
        const unresolvedDirectionCount = items.reduce(
          (sum, item) => sum + (item.directions ?? []).filter((note) => !note.resolved).length,
          0,
        );

        return {
          id,
          name: String(row.name),
          ownerKind,
          ownerId,
          ownerName,
          coverImageUrl: typeof row.cover_image_url === 'string' ? row.cover_image_url : null,
          updatedAt: String(row.updated_at),
          reactionStatus,
          verdicts,
          unresolvedDirectionCount,
        };
      });

      return { boards, capped };
    },
  });
}
