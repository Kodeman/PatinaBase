import { createContext } from 'react';
import type { BoardOwnerRef } from '@patina/types';
import {
  buildRoomHref,
  type BuildRoomLens,
  type BuildRoomState,
} from '@/lib/document/pieces/build-room-url';
import type { RegionLedgerEntry } from '../../region/region-head';

/**
 * WP-01.6 — round 8 opens the FF&E sheet in place, at a room (`null` for the
 * whole job) and a lens, remembering the control pressed. Absent, every Build
 * room door routes to `/doc/[id]/pieces` exactly as before (legacy).
 *
 * Kept apart from the chapter so the FF&E body (on the legacy route too) can
 * read it without loading the unfold or the sheet.
 */
export type WorkRoom = (
  room: string | null,
  lens?: BuildRoomLens,
  opener?: Element | null,
) => void;

/**
 * The owner the unfolded sheet's spec saves register under, and its close
 * waits on (F3). Its own key, never a board's project owner, so a board's
 * Send barrier never waits on — or fails over — an FF&E field.
 */
export function ffeSheetAutosaveOwner(id: string): BoardOwnerRef {
  return { kind: 'project', id: `ffe-sheet:${id}` };
}

/** The round-8 FF&E chapter that hosts the unfold supplies its opener here. */
export const FfeWorkRoomContext = createContext<WorkRoom | null>(null);

/**
 * A press that means "here": the primary button with no modifier. A Build
 * room door keeps its route `href`, so any other press (a new tab, a new
 * window, a middle click) follows the link instead of unfolding in place.
 */
export function isPlainPress(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * A head's Build room door ("Edit pieces & purchasing", a missing price)
 * always names its route. With a `workRoom` (round 8) a plain press opens
 * the sheet in place; any other press follows the link, as the per-room
 * door (`pieces-overview-row`) does.
 */
export function buildRoomDoor(
  docId: string,
  state: BuildRoomState,
  workRoom: WorkRoom | undefined,
): Pick<RegionLedgerEntry, 'href' | 'onClick'> {
  const href = buildRoomHref(docId, state);
  if (!workRoom) return { href };
  return {
    href,
    onClick: (event) => {
      if (!isPlainPress(event)) return;
      event.preventDefault();
      workRoom(state.room, state.lens, event.currentTarget);
    },
  };
}
