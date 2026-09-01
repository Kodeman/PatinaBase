'use client';

import { useMemo } from 'react';
import { useActiveBoardShareIds } from './use-document-shares';
import {
  deriveBoardReactionStatus,
  type BoardReactionStatus,
  type BoardVerdictCounts,
} from './board-verdicts';

/**
 * Board-level reaction-status chip (board-paths W2b #1). Batches the active-
 * share lookup for every board on the surface into one query, then derives
 * each board's status with the same pure rule the desk rollup (#3) uses, so a
 * card and the desk line never disagree.
 */
export function useBoardReactionStatuses(
  boards: readonly { id: string; verdict_counts: BoardVerdictCounts }[],
): Map<string, BoardReactionStatus | null> {
  const boardIds = useMemo(() => boards.map((board) => board.id), [boards]);
  const { data: activeShareIds } = useActiveBoardShareIds(boardIds);

  return useMemo(() => {
    const shares = activeShareIds ?? new Set<string>();
    const result = new Map<string, BoardReactionStatus | null>();
    for (const board of boards) {
      result.set(
        board.id,
        deriveBoardReactionStatus({
          verdictCounts: board.verdict_counts,
          hasActiveShare: shares.has(board.id),
        }),
      );
    }
    return result;
  }, [boards, activeShareIds]);
}
