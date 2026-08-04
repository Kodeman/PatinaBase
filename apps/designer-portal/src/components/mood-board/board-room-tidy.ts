import type { EditableMoodBoardItem } from '@patina/types';

export const BOARD_ROOM_DEFAULT_TIDY_GAP = 24;
export const BOARD_ROOM_MIN_TIDY_GAP = 8;
export const BOARD_ROOM_MAX_TIDY_GAP = 80;

export interface BoardRoomTidyTarget {
  scope: 'selection' | 'board';
  /** Empty means the controller's section-aware whole-board path. */
  itemIds: string[];
  itemCount: number;
  enabled: boolean;
  key: string;
}
/**
 * Mirrors R1.15's scope rule while honoring the invariant that locked pins do
 * not move. A zero/one-item selection falls back to the whole board.
 */
export function resolveBoardRoomTidyTarget(
  items: readonly EditableMoodBoardItem[],
  selectedItemIds: readonly string[],
): BoardRoomTidyTarget {
  const selectionScoped = selectedItemIds.length >= 2;
  const selected = new Set(selectedItemIds);
  const movable = items.filter((item) =>
    !item.locked && (!selectionScoped || selected.has(item.id)),
  );
  const itemIds = selectionScoped ? movable.map((item) => item.id) : [];
  const scope = selectionScoped ? 'selection' : 'board';
  return {
    scope,
    itemIds,
    itemCount: movable.length,
    enabled: movable.length >= 2,
    key: `${scope}:${itemIds.length > 0 ? [...itemIds].sort().join(',') : movable.map((item) => item.id).sort().join(',')}`,
  };
}
