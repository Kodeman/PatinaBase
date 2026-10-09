/**
 * Where focus goes on the Build room's sheet (US-21 T-60a, F2/F5/F6/F7).
 * Focus never drops to `<body>`: after an act it lands on the acted line, the
 * row that now holds its place, or the room's heading.
 *
 * Ids are uuids or the rail words, so elements are matched by attribute value
 * rather than by a selector that would need escaping.
 */

/** Marks a place's heading on any lens: `tabIndex=-1`, no ring on programmatic focus. */
export const ROOM_HEADING_ATTR = "data-room-heading";

/** The class a programmatically focused heading carries: no visible ring. */
export const QUIET_FOCUS = "focus:outline-none";

function byAttr(
  root: ParentNode | null | undefined,
  attr: string,
  value: string,
): HTMLElement | null {
  return (
    Array.from(root?.querySelectorAll<HTMLElement>(`[${attr}]`) ?? []).find(
      (el) => el.getAttribute(attr) === value,
    ) ?? null
  );
}

/** A place's heading on the sheet, if it has rendered. */
export function roomHeading(
  root: ParentNode | null | undefined,
  placeId: string,
): HTMLElement | null {
  return byAttr(root, ROOM_HEADING_ATTR, placeId);
}

export interface FocusLineOptions {
  /** Narrows it to one place's section: a line in several rooms, or one just moved. */
  within?: (row: HTMLElement) => boolean;
  /** The row's first field rather than its `⋯`. */
  field?: boolean;
}

/**
 * Focus a line's row: its `⋯` (the row-menu trigger), else its first field,
 * or the first field first with `field`. False when the line is not on the
 * sheet (yet).
 */
export function focusLineAct(
  root: ParentNode | null | undefined,
  lineId: string,
  { within, field = false }: FocusLineOptions = {},
): boolean {
  const row = Array.from(
    root?.querySelectorAll<HTMLElement>("[data-line-id]") ?? [],
  ).find(
    (el) =>
      el.getAttribute("data-line-id") === lineId && (!within || within(el)),
  );
  const trigger = row?.querySelector<HTMLElement>(
    'button[aria-haspopup="menu"]',
  );
  const first = row?.querySelector<HTMLElement>("input, button");
  const target = field ? (first ?? trigger) : (trigger ?? first);
  if (!target) return false;
  target.focus();
  return true;
}

/** True when `el` sits in the section whose `attr` names `placeId`. */
export function inPlace(
  el: Element,
  attr: string,
  placeId: string | null | undefined,
): boolean {
  return !placeId || el.closest(`[${attr}]`)?.getAttribute(attr) === placeId;
}

/** Marks the Build room head's title, focused when no room heading is. */
export const BUILD_ROOM_TITLE_ATTR = "data-build-room-title";

/** Focus a place's heading, else the Build room's title; never the page body. */
export function focusPlace(
  root: ParentNode | null | undefined,
  placeId: string | null | undefined,
): void {
  const heading =
    (placeId ? roomHeading(root, placeId) : null) ??
    document.querySelector<HTMLElement>(`[${BUILD_ROOM_TITLE_ATTR}]`);
  heading?.focus({ preventScroll: true });
}

/**
 * The line that takes a row's place once it leaves its section: the next
 * line, else the one before, else none. Read before the row goes.
 */
export function neighborLineId(
  section: Element | null | undefined,
  lineId: string,
): string | null {
  const ids = Array.from(
    section?.querySelectorAll<HTMLElement>("[data-line-id]") ?? [],
  )
    .map((el) => el.getAttribute("data-line-id") ?? "")
    .filter((id) => id !== "" && !id.startsWith("pending:"));
  const unique = ids.filter((id, i) => ids.indexOf(id) === i);
  const index = unique.indexOf(lineId);
  if (index < 0) return null;
  return unique[index + 1] ?? unique[index - 1] ?? null;
}

/** True while focus sits inside `el`. */
export function holdsFocus(el: Element | null | undefined): boolean {
  return (
    !!el &&
    typeof document !== "undefined" &&
    el.contains(document.activeElement)
  );
}
