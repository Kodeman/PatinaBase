/**
 * A room's state, in one word — the tri-state the FF&E section's room headings
 * have always drawn (all lines installed = settled, any line on the books =
 * active, nothing yet = future), lifted out so the spine's Rooms block and the
 * heading itself answer from ONE derivation rather than two that can drift.
 *
 * The normalization lives HERE, not in the callers. A line's raw `status`
 * column and its derived stamp are not the same claim: an installed piece with
 * an open damage claim stamps `damaged`, and a room holding one is not settled.
 * Reading the column in the spine and the stamp in the section produced exactly
 * that disagreement, so both now enter through `roomStateRow*` below.
 */

import { deriveLineStamp, type LineStampInput, type TradeLineProgress } from './stamp-derivation';

export type RoomState = 'settled' | 'active' | 'future';

export interface RoomStateRow {
  installed: boolean;
}

/** From an already-derived stamp — the FF&E section's path, which resolves
 *  trade progress the spine has no way to see. */
export function roomStateRowFromStamp(stamp: { kind: string }): RoomStateRow {
  return { installed: stamp.kind === 'installed' };
}

/** From a raw schedule line — the spine's path. Runs the SAME derivation the
 *  section runs, so the two words agree wherever the inputs agree. */
export function roomStateRowFromLine(
  line: LineStampInput,
  tradeProgress?: TradeLineProgress | null,
): RoomStateRow {
  return roomStateRowFromStamp(deriveLineStamp(line, tradeProgress));
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
