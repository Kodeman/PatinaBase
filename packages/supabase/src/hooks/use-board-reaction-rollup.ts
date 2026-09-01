'use client';

// Desk-level "N awaiting reaction / N reactions in / N approved awaiting
// pipeline" line (board-paths W2b #3, DV10-lite). Bounded and RLS-scoped —
// never an unbounded all-boards scan; `capped` tells the caller when the read
// stopped short of every active board so the UI can say so rather than imply
// completeness.
//
// C5 (board-paths review, 2026-09-01): this used to run its OWN independent
// query, separate from use-studio-boards-overview.ts's — two different caps
// (40 vs 60), two different network round-trips, free to disagree about which
// boards fall in a bucket whenever the active-board count sat between them.
// The desk rollup's counts link straight to /boards (desk-boards-reaction-
// rollup.tsx); they must never show a different number than the page they
// point at. This now DERIVES its three buckets from useStudioBoardsOverview
// with the SAME default cap (DEFAULT_STUDIO_BOARDS_CAP) — same query, same
// react-query cache key, same data, when neither caller overrides the cap.

import { useMemo } from 'react';
import {
  useStudioBoardsOverview,
  DEFAULT_STUDIO_BOARDS_CAP,
  MAX_STUDIO_BOARDS_CAP,
  type StudioBoardsOverview,
} from './use-studio-boards-overview';

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

/**
 * Pure grouping step, split out from the hook so it's testable without a
 * React render: fold {@link useStudioBoardsOverview}'s flat board list into
 * the three reaction-status buckets `deriveBoardReactionStatus` assigns. A
 * board with no reaction status (never shared, no reactions) appears in none
 * of the three buckets.
 */
export function deriveBoardsReactionRollup(
  overview: StudioBoardsOverview | undefined,
): BoardsReactionRollup | undefined {
  if (!overview) return undefined;
  const result: BoardsReactionRollup = {
    awaitingReaction: [],
    reactionsIn: [],
    approvedPipeline: [],
    capped: overview.capped,
  };
  for (const board of overview.boards) {
    if (!board.reactionStatus) continue;
    const entry: BoardReactionRollupEntry = {
      id: board.id,
      name: board.name,
      ownerName: board.ownerName,
      updatedAt: board.updatedAt,
    };
    if (board.reactionStatus === 'awaiting_reaction') result.awaitingReaction.push(entry);
    else if (board.reactionStatus === 'reactions_in') result.reactionsIn.push(entry);
    else result.approvedPipeline.push(entry);
  }
  return result;
}

/**
 * A bounded, RLS-scoped rollup of the designer's active boards into the three
 * reaction-status buckets `deriveBoardReactionStatus` assigns — sourced from
 * {@link useStudioBoardsOverview}, so the desk line and the /boards page it
 * links to are always describing the exact same read.
 */
export function useBoardsReactionRollup(cap = DEFAULT_STUDIO_BOARDS_CAP) {
  const safeCap = Math.max(1, Math.min(MAX_STUDIO_BOARDS_CAP, Math.trunc(cap) || DEFAULT_STUDIO_BOARDS_CAP));
  const overview = useStudioBoardsOverview(safeCap);
  const rollup = useMemo(() => deriveBoardsReactionRollup(overview.data), [overview.data]);
  return { ...overview, data: rollup };
}
