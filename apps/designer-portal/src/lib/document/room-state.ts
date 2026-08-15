/**
 * A room's state, in one word — the tri-state the FF&E section's room headings
 * have always drawn (all lines installed = settled, any line on the books =
 * active, nothing yet = future), lifted out so the spine's Rooms block and the
 * heading itself answer from ONE derivation rather than two that can drift.
 *
 * The caller decides what "installed" means for the rows it holds: the FF&E
 * section reads its derived line stamp, the spine reads the raw item status.
 */

export type RoomState = 'settled' | 'active' | 'future';

export interface RoomStateRow {
  installed: boolean;
}

export function roomState(rows: readonly RoomStateRow[]): RoomState {
  const installed = rows.filter((r) => r.installed).length;
  return rows.length > 0 && installed === rows.length
    ? 'settled'
    : rows.length > 0
      ? 'active'
      : 'future';
}

/** The spine's word for the same tri-state. */
export function roomStateWord(rows: readonly RoomStateRow[]): string {
  switch (roomState(rows)) {
    case 'settled':
      return 'Installed';
    case 'active':
      return 'Underway';
    case 'future':
      return 'Not started';
  }
}

/**
 * The room lens's lift: a STABLE partition — rows belonging to the held room
 * move to the front, everything else keeps its original order behind them.
 * Nothing is ever filtered out; a lens that hides is a filter, not a lens.
 */
export function liftByRoom<T>(
  rows: readonly T[],
  heldRoomId: string | null,
  roomIdOf: (row: T) => string | null | undefined,
): T[] {
  if (!heldRoomId) return [...rows];
  return [...rows].sort(
    (a, b) =>
      (roomIdOf(a) === heldRoomId ? 0 : 1) - (roomIdOf(b) === heldRoomId ? 0 : 1),
  );
}
