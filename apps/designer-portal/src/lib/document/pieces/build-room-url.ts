/**
 * The Build room's address (US-21 S7, CONTRACT §3.4). Lens and room live in
 * the URL (`/doc/[id]/pieces?lens=…&room=…`), so back and forward walk lens
 * changes, and leaving lands on the overview at the room the reader was in:
 * `/doc/[id]#pieces-room-<roomId>` (a10, R1-F10).
 */

/**
 * The lens words, in head order; Finishes is the fifth (a11, Q10). Price is
 * dropped for a seat without money (R1, Q7).
 */
export const BUILD_ROOM_LENSES = [
  "rough",
  "spec",
  "price",
  "release",
  "finishes",
] as const;
export type BuildRoomLens = (typeof BUILD_ROOM_LENSES)[number];

/** Rail places that are not a project room. Room ids are uuids, so these never collide. */
export const THROUGHOUT_PLACE = "throughout";
export const UNASSIGNED_PLACE = "unassigned";
export const REMOVED_PLACE = "removed";

/** A room id, one of the three rail places above, or `null` for the whole job. */
export type BuildRoomPlace = string | null;

export interface BuildRoomState {
  lens: BuildRoomLens;
  room: BuildRoomPlace;
}

/** The overview's Pieces region (ffe-section `id="project-ffe"`). */
export const PIECES_REGION_ANCHOR = "project-ffe";

export function availableLenses(canSeeMoney: boolean): BuildRoomLens[] {
  return BUILD_ROOM_LENSES.filter((lens) => lens !== "price" || canSeeMoney);
}

/**
 * Reads `?lens=` and `?room=`. An unknown lens, or Price for a seat without
 * money, reads as Rough in; the URL itself is left as it is, so a seat whose
 * money answer arrives late still lands on Price.
 */
export function parseBuildRoomSearch(
  params: { get(name: string): string | null } | null | undefined,
  { canSeeMoney }: { canSeeMoney: boolean },
): BuildRoomState {
  const rawLens = params?.get("lens") ?? null;
  const lens =
    availableLenses(canSeeMoney).find((candidate) => candidate === rawLens) ??
    "rough";
  const rawRoom = params?.get("room")?.trim() ?? "";
  return { lens, room: rawRoom === "" ? null : rawRoom };
}

export function buildRoomHref(
  docId: string,
  { lens, room }: BuildRoomState,
): string {
  const params = new URLSearchParams({ lens });
  if (room) params.set("room", room);
  return `/doc/${docId}/pieces?${params.toString()}`;
}

export function piecesRoomAnchorId(roomId: string): string {
  return `pieces-room-${roomId}`;
}

function isProjectRoom(room: BuildRoomPlace): room is string {
  return (
    room != null &&
    room !== THROUGHOUT_PLACE &&
    room !== UNASSIGNED_PLACE &&
    room !== REMOVED_PLACE
  );
}

/** Where ←, Esc and back land: the overview at the room, else at the Pieces region. */
export function buildRoomReturnHref(
  docId: string,
  room: BuildRoomPlace,
): string {
  const anchor = isProjectRoom(room)
    ? piecesRoomAnchorId(room)
    : PIECES_REGION_ANCHOR;
  return `/doc/${docId}#${anchor}`;
}

/** True for the document page itself, the one place a return lands. */
export function isDocumentOverviewPath(
  pathname: string,
  docId: string,
): boolean {
  return pathname.replace(/\/+$/, "") === `/doc/${docId}`;
}
