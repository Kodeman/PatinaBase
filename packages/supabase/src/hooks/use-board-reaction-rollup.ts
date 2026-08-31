'use client';

// Desk-level "N awaiting reaction / N reactions in / N approved awaiting
// pipeline" line (board-paths W2b #3, DV10-lite). Bounded and RLS-scoped —
// never an unbounded all-boards scan; `capped` tells the caller when the read
// stopped short of every active board so the UI can say so rather than imply
// completeness.

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { fetchActiveBoardShareIds } from './use-document-shares';
import {
  deriveBoardReactionStatus,
  summarizeBoardVerdicts,
  type BoardItemVerdictProjection,
} from './board-verdicts';

const getSupabase = () => createBrowserClient();

const DEFAULT_CAP = 40;
const MAX_CAP = 100;

export interface BoardReactionRollupEntry {
  id: string;
  name: string;
  ownerName: string;
  updatedAt: string;
}

export interface BoardsReactionRollup {
  awaitingReaction: BoardReactionRollupEntry[];
  reactionsIn: BoardReactionRollupEntry[];
  approvedPipeline: BoardReactionRollupEntry[];
  /** True when more active boards exist than this bounded read returned. */
  capped: boolean;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * A bounded, RLS-scoped rollup of the designer's active boards into the three
 * reaction-status buckets used by {@link deriveBoardReactionStatus} — the same
 * derivation the per-board chip uses (useBoardReactionStatuses), so the desk
 * line and a board card are always describing the same rule.
 */
export function useBoardsReactionRollup(cap = DEFAULT_CAP) {
  const safeCap = Math.max(1, Math.min(MAX_CAP, Math.trunc(cap) || DEFAULT_CAP));
  return useQuery({
    queryKey: ['boards-reaction-rollup', safeCap],
    queryFn: async (): Promise<BoardsReactionRollup> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_boards')
        .select(
          'id, name, proposal_id, project_id, updated_at, proposal:proposals(title), project:projects(name), proposal_board_items(verdicts:item_feedback!item_feedback_board_item_id_fkey(id, client_id, verdict, created_at))',
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

      const rollup: BoardsReactionRollup = {
        awaitingReaction: [],
        reactionsIn: [],
        approvedPipeline: [],
        capped,
      };

      for (const row of boardRows) {
        const id = String(row.id);
        const proposalId = typeof row.proposal_id === 'string' ? row.proposal_id : null;
        const proposal = firstRelation(row.proposal as { title?: unknown } | null);
        const project = firstRelation(row.project as { name?: unknown } | null);
        const ownerName = proposalId
          ? (typeof proposal?.title === 'string' && proposal.title.trim() ? proposal.title : 'Draft proposal')
          : (typeof project?.name === 'string' && project.name.trim() ? project.name : 'Project');
        const items = (row.proposal_board_items ?? []) as BoardItemVerdictProjection[];
        const status = deriveBoardReactionStatus({
          verdictCounts: summarizeBoardVerdicts(items),
          hasActiveShare: activeShareIds.has(id),
        });
        if (!status) continue;

        const entry: BoardReactionRollupEntry = {
          id,
          name: String(row.name),
          ownerName,
          updatedAt: String(row.updated_at),
        };
        if (status === 'awaiting_reaction') rollup.awaitingReaction.push(entry);
        else if (status === 'reactions_in') rollup.reactionsIn.push(entry);
        else rollup.approvedPipeline.push(entry);
      }

      return rollup;
    },
  });
}
