/**
 * The Spec lens's pure reads (US-21 T-29, a4, R3 §6, CONTRACT §3.6): which
 * lines a rail place holds, how many of a line's six spec fields are filled
 * (`N OF 6`), and which line `NEXT UNFINISHED →` goes to.
 *
 * The six are the fields a4 lists before the location and notes: the product
 * or maker, the image, finish, material, color and dimensions. Exact location
 * is left out because it reads `See drawings` until it is set, and notes are
 * optional. A placeholder has no product and no maker, so it is never 6 of 6.
 */
import {
  REMOVED_PLACE,
  THROUGHOUT_PLACE,
  UNASSIGNED_PLACE,
  type BuildRoomPlace,
} from "./build-room-url";

export const SPEC_FIELD_COUNT = 6;

/** The spec row's columns the count reads (`project_ffe_specs`). */
export interface SpecProgressSpec {
  finish?: string | null;
  material?: string | null;
  color_fabric?: string | null;
  selected_dimensions?: unknown;
  selected_media?: unknown;
}

/** The line's columns the count reads (`project_ffe_items`, product embed). */
export interface SpecProgressLine {
  product_id?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  product?: { images?: unknown } | null;
}

const filledText = (value: string | null | undefined) =>
  (value ?? "").trim() !== "";

/** The first `selected_media` entry's link: a string, or an object's `url`. */
export function selectedMediaUrl(media: unknown): string | null {
  if (!Array.isArray(media) || media.length === 0) return null;
  const first: unknown = media[0];
  if (typeof first === "string") return first.trim() || null;
  if (first && typeof first === "object" && "url" in first) {
    const url = (first as { url?: unknown }).url;
    return typeof url === "string" && url.trim() ? url.trim() : null;
  }
  return null;
}

/** The image the line prints: its own (D15), else its product's first. */
export function lineImageUrl(
  line: SpecProgressLine,
  spec: SpecProgressSpec | null | undefined,
): string | null {
  const own = selectedMediaUrl(spec?.selected_media);
  if (own) return own;
  const images = line.product?.images;
  return Array.isArray(images) && typeof images[0] === "string" && images[0]
    ? images[0]
    : null;
}

function dimensionsFilled(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, v]) => key !== "unit" && v != null && String(v).trim() !== "",
  );
}

/** A product, a vendor, or a vendor name that is not blank (D1's maker). */
export function hasProductOrMaker(line: SpecProgressLine): boolean {
  return (
    line.product_id != null ||
    line.vendor_id != null ||
    filledText(line.vendor_name)
  );
}

/** How many of the six spec fields the line has filled. */
export function specProgress(
  line: SpecProgressLine,
  spec: SpecProgressSpec | null | undefined,
): number {
  return [
    hasProductOrMaker(line),
    lineImageUrl(line, spec) != null,
    filledText(spec?.finish),
    filledText(spec?.material),
    filledText(spec?.color_fabric),
    dimensionsFilled(spec?.selected_dimensions),
  ].filter(Boolean).length;
}

/** `5 OF 6`. */
export function specProgressLabel(filled: number): string {
  return `${filled} OF ${SPEC_FIELD_COUNT}`;
}

export interface SpecPlaceLine {
  id: string;
  project_room_id?: string | null;
  assignment_scope?: string | null;
  line_kind?: string | null;
  parent_ffe_item_id?: string | null;
}

export interface SpecPlacePlacement {
  ffeItemId: string;
  projectRoomId: string;
}

/**
 * The lines a rail place holds, in the job's order with each labor line right
 * under its piece. A room holds its primary lines and every line placed in it
 * (as `room-counts.ts` counts them); `throughout` and `unassigned` hold the
 * lines in no known room; the whole job (`null`) holds every line. Removed
 * lines are not specced, so `removed` holds none.
 */
export function linesForPlace<T extends SpecPlaceLine>(
  lines: readonly T[],
  placements: readonly SpecPlacePlacement[],
  place: BuildRoomPlace,
  roomIds: readonly string[],
): T[] {
  if (place === REMOVED_PLACE) return [];
  const known = new Set(roomIds);
  const roomsOf = new Map<string, Set<string>>();
  for (const line of lines) {
    const set = new Set<string>();
    if (line.project_room_id) set.add(line.project_room_id);
    roomsOf.set(line.id, set);
  }
  for (const placement of placements) {
    roomsOf.get(placement.ffeItemId)?.add(placement.projectRoomId);
  }
  const inPlace = (line: T): boolean => {
    if (place == null) return true;
    const rooms = roomsOf.get(line.id) ?? new Set<string>();
    if (place === THROUGHOUT_PLACE || place === UNASSIGNED_PLACE) {
      if ([...rooms].some((id) => known.has(id))) return false;
      return (
        (line.assignment_scope === "unassigned") ===
        (place === UNASSIGNED_PLACE)
      );
    }
    return rooms.has(place);
  };

  const held = lines.filter(inPlace);
  const heldIds = new Set(held.map((line) => line.id));
  const laborOf = new Map<string, T[]>();
  const ordered: T[] = [];
  for (const line of held) {
    const parent = line.parent_ffe_item_id;
    if (line.line_kind === "labor" && parent && heldIds.has(parent)) {
      laborOf.set(parent, [...(laborOf.get(parent) ?? []), line]);
    }
  }
  for (const line of held) {
    const parent = line.parent_ffe_item_id;
    if (line.line_kind === "labor" && parent && heldIds.has(parent)) continue;
    ordered.push(line, ...(laborOf.get(line.id) ?? []));
  }
  return ordered;
}

/**
 * `NEXT UNFINISHED →`: the first line after the current one, wrapping, with
 * fewer than six fields filled. `null` when every other line has its six.
 */
export function nextUnfinishedId(
  orderedIds: readonly string[],
  currentId: string | null,
  progress: (id: string) => number,
): string | null {
  const start = currentId ? orderedIds.indexOf(currentId) : -1;
  for (let step = 1; step <= orderedIds.length; step += 1) {
    const id =
      orderedIds[(start + step + orderedIds.length) % orderedIds.length];
    if (id !== currentId && progress(id) < SPEC_FIELD_COUNT) return id;
  }
  return null;
}
