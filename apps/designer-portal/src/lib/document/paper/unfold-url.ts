/**
 * The round-8 unfold address (C1 §2, WP-01.4b). An instrument unfolded inside
 * the paper keeps its place in the bar:
 * `/doc/[id]?unfold=pieces&lens=&room=&line=`. The address names where the
 * reader stands, never an act, so a reload or Back/Forward reopens it without
 * replaying a write.
 *
 * `lens` and `room` read through `parseBuildRoomSearch` unchanged, so the
 * unfolded sheet and the `/doc/[id]/pieces` route agree on every lens rule
 * but one: the unfold is the round-8 sheet, so it alone reads `purchase`.
 */

import type { Landing } from "@/lib/arrival/types";
import {
  parseBuildRoomSearch,
  type BuildRoomLens,
  type BuildRoomPlace,
} from "@/lib/document/pieces/build-room-url";

/** What can unfold in place. Wave 1 unfolds the FF&E sheet only. */
export const UNFOLD_KINDS = ["pieces"] as const;
export type UnfoldKind = (typeof UNFOLD_KINDS)[number];

/**
 * The `data-paper-chapter` key each instrument belongs to: where an unfold
 * whose entry recorded no return place (a deep link, a reload) folds back to.
 */
export const UNFOLD_HOME_CHAPTER: Record<UnfoldKind, string> = {
  pieces: "ffe",
};

export interface UnfoldAddress {
  kind: UnfoldKind;
  lens: BuildRoomLens;
  room: BuildRoomPlace;
  /** A `project_ffe_items.id`; anything that is not uuid-shaped reads as none. */
  line: string | null;
}

/** The parameters the unfold owns. Closing removes exactly these. */
export const UNFOLD_PARAMS = ["unfold", "lens", "room", "line"] as const;

/** The one-shot landing instruction, and its legacy alias. */
export const LAND_PARAM = "land";
export const FFE_ITEM_ALIAS_PARAM = "ffeItemId";

type SearchLike = { get(name: string): string | null } | null | undefined;
type LocationLike = Pick<Location, "pathname" | "search" | "hash">;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Reads the unfold address, or `null` when nothing is unfolded. Parameters
 * the unfold does not own are ignored.
 */
export function parseUnfoldSearch(
  params: SearchLike,
  { canSeeMoney }: { canSeeMoney: boolean },
): UnfoldAddress | null {
  const rawKind = params?.get("unfold") ?? null;
  const kind = UNFOLD_KINDS.find((candidate) => candidate === rawKind);
  if (!kind) return null;
  const { lens, room } = parseBuildRoomSearch(params, {
    canSeeMoney,
    round8: true,
  });
  const rawLine = params?.get("line")?.trim() ?? "";
  return { kind, lens, room, line: isUuid(rawLine) ? rawLine : null };
}

function withoutUnfold(search: string): URLSearchParams {
  const params = new URLSearchParams(search);
  for (const name of UNFOLD_PARAMS) params.delete(name);
  return params;
}

function query(params: URLSearchParams): string {
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

/** The search string with `address` unfolded; other parameters are kept. */
export function unfoldSearch(search: string, address: UnfoldAddress): string {
  const params = withoutUnfold(search);
  params.set("unfold", address.kind);
  params.set("lens", address.lens);
  if (address.room) params.set("room", address.room);
  if (isUuid(address.line)) params.set("line", address.line);
  return query(params);
}

/** The search string with the unfold folded away; other parameters are kept. */
export function closedSearch(search: string): string {
  return query(withoutUnfold(search));
}

export function unfoldUrl(location: LocationLike, address: UnfoldAddress) {
  return `${location.pathname}${unfoldSearch(location.search, address)}${location.hash}`;
}

export function closedUrl(location: LocationLike): string {
  return `${location.pathname}${closedSearch(location.search)}${location.hash}`;
}

/**
 * The landing a URL asks for: `land=region:<key>`, `land=section:<key>` or
 * `land=line:<uuid>`, else the legacy `ffeItemId=<uuid>` alias. Landing only
 * positions and focuses; it never names a write.
 */
export function readLanding(params: SearchLike): Landing | null {
  const land = params?.get(LAND_PARAM)?.trim() ?? "";
  const sep = land.indexOf(":");
  if (sep > 0) {
    const kind = land.slice(0, sep);
    const value = land.slice(sep + 1);
    if (kind === "region" && value !== "") return { kind: "region", region: value };
    if (kind === "section" && value !== "") {
      return { kind: "section", sectionKey: value };
    }
    if (kind === "line" && isUuid(value)) return { kind: "ffe", ffeItemId: value };
  }
  const alias = params?.get(FFE_ITEM_ALIAS_PARAM)?.trim() ?? "";
  return isUuid(alias) ? { kind: "ffe", ffeItemId: alias } : null;
}

/**
 * Consumes `land` once: the landing it named, and the search to
 * `replaceState` to so a reload or Back does not land again. The legacy
 * `ffeItemId` alias is left to the page that already reads it.
 */
export function consumeLanding(search: string): {
  landing: Landing | null;
  search: string;
} {
  const params = new URLSearchParams(search);
  const landing = readLanding(params);
  params.delete(LAND_PARAM);
  return { landing, search: query(params) };
}
