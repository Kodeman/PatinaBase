/**
 * US-21 T-24 — the Rough in table's key map (CONTRACT §3.6, SPEC a2).
 *
 * Pure: the table asks what a keystroke means and does it. The cells sit in
 * DOM order, so the browser's Tab moves across. The one exception (T-52, D6):
 * Tab with the caret at the start of a line's name indents it into a group,
 * and Shift-Tab there takes it out. The table claims it only when it applies.
 */
import type { FfeLineUnit } from "@patina/types";

export const ROUGH_IN_KEY_HINT =
  "ENTER ADDS THE LINE · TAB MOVES ACROSS · ⌘↓ NEXT ROOM · PASTE A LIST TO ADD SEVERAL · / SEARCHES THE LIBRARY";

/** The phone's hint (a13): no keyboard-only keys; `ADD` is on the screen. */
export const ROUGH_IN_TOUCH_HINT =
  "PASTE A LIST TO ADD SEVERAL · / SEARCHES THE LIBRARY";

/** Below md the lines are 56px cards, not the table (a13). */
export const ROUGH_IN_PHONE_QUERY = "(max-width: 767px)";

export type RoughInKeyAction =
  /** Enter on the entry row: add the line and start the next one here. */
  | "add"
  /** Enter on a line's cell: keep the edit and go to the entry row. */
  | "commit"
  /** ⌘↓ / Ctrl↓: the next room's entry row. */
  | "next-room"
  /** Backspace on an empty name, or ⌘⌫ / Ctrl⌫ anywhere on a line. */
  | "remove"
  /** `/` in an empty name: search the Library. */
  | "search"
  /** Tab at the start of a line's name: into the group above, or a new one. */
  | "indent"
  /** Shift-Tab at the start of a line's name: out of its group. */
  | "outdent";

export interface RoughInKeyContext {
  /** The entry row (always last) rather than an existing line. */
  entry: boolean;
  /** The focused cell is the Line (name) cell. */
  nameCell: boolean;
  /** The focused cell's current text. */
  value: string;
  /** The caret sits at the start of the cell with nothing selected. */
  caretAtStart?: boolean;
}

/** True when an input's caret is at 0 with no selection (a Tab in selects all). */
export function isCaretAtStart(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement &&
    target.selectionStart === 0 &&
    target.selectionEnd === 0
  );
}

type KeyLike = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

export function roughInKeyAction(
  event: KeyLike,
  ctx: RoughInKeyContext,
): RoughInKeyAction | null {
  const mod = event.metaKey || event.ctrlKey;
  if (event.key === "ArrowDown" && mod) return "next-room";
  if (event.key === "Enter" && !mod && !event.altKey && !event.shiftKey) {
    return ctx.entry ? "add" : "commit";
  }
  if (event.key === "Backspace" && !ctx.entry) {
    if (mod) return "remove";
    if (ctx.nameCell && ctx.value === "") return "remove";
  }
  if (event.key === "/" && !mod && ctx.nameCell && ctx.value === "")
    return "search";
  if (
    event.key === "Tab" &&
    !mod &&
    !event.altKey &&
    !ctx.entry &&
    ctx.nameCell &&
    ctx.caretAtStart
  )
    return event.shiftKey ? "outdent" : "indent";
  return null;
}

/** Arrow / Home / End movement inside a `role="menu"`; null when the key is not one. */
export function menuKeyIndex(
  key: string,
  index: number,
  count: number,
): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** A pasted list: more than one non-blank line goes to the paste preview. */
export function isPastedList(text: string): boolean {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").length > 1;
}

export const ROUGH_IN_UNITS: readonly FfeLineUnit[] = [
  "each",
  "sq_ft",
  "lin_ft",
  "roll",
  "yard",
  "box",
  "hour",
  "lot",
];

/** `sq_ft` prints `sq ft` (SPEC §4.2). */
export function unitLabel(unit: FfeLineUnit): string {
  return unit.replace("_", " ");
}

/** The rough figure: `~$4,800`; nothing when there is none (SPEC §2.3, a2). */
export function formatRough(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return `~$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** `~$4,800`, `4800`, `4,800.50` → cents; blank → null; nonsense → undefined (keep the old value). */
export function parseRough(text: string): number | null | undefined {
  const cleaned = text.replace(/[~$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

/** A whole quantity of at least 1 (D17 fractional quantity is deferred). */
export function parseQuantity(text: string): number | undefined {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** The DOM hook the entry rows carry, so ⌘↓ finds the next room's. */
export const ENTRY_NAME_ATTR = "data-rough-in-entry";

/** Focus the next room's entry name after `from`'s; false at the last room. */
export function focusNextRoomEntry(from: HTMLElement): boolean {
  const entries = Array.from(
    from.ownerDocument.querySelectorAll<HTMLInputElement>(
      `input[${ENTRY_NAME_ATTR}]`,
    ),
  );
  const table = from.closest("[data-rough-in-room]");
  const index = entries.findIndex(
    (input) => input.closest("[data-rough-in-room]") === table,
  );
  const next = index >= 0 ? entries[index + 1] : undefined;
  if (!next) return false;
  next.focus();
  return true;
}
