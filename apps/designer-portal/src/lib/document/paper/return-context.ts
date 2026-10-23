/**
 * The place a reader leaves when an instrument unfolds over the paper, and how
 * she is put back (DESIGN-CONTRACT "Return and editing contract", WP-01.4b).
 *
 * Captured at the opening act: the document, chapter, room, line or package,
 * lens, filters, selection, a scroll anchor, and the control that opened it.
 * Restored on close: the anchor goes back where it stood, and focus returns to
 * that control. When the control is gone (its record was removed, or is no
 * longer readable) or was never recorded (a deep link or a reload), focus
 * falls back to the room's heading, then the chapter's, then the paper root,
 * and a live-region message says where the reader is. The message never says "not
 * found": a record the reader cannot see must not be told apart from one that
 * was removed (X02).
 *
 * The context is plain data, so it rides in `history.state` and survives a
 * reload. It is navigation state, never domain data, and carries no act.
 */

import { isElementRendered } from "@/components/document/overlays/active-dialog";
import { piecesRoomAnchorId } from "@/lib/document/pieces/build-room-url";
import { roomHeading } from "@/lib/document/pieces/sheet-focus";

/** Marks the control an instrument was opened from. */
export const RETURN_CONTROL_ATTR = "data-return-control";
/** Marks a paper chapter's section; its value is the chapter key. */
export const PAPER_CHAPTER_ATTR = "data-paper-chapter";
/** Marks a chapter's heading inside its section. */
export const CHAPTER_HEADING_ATTR = "data-chapter-heading";
/** The paper root (shell DOM contract): the last rung of the focus ladder. */
export const PAPER_ROOT_SELECTOR = "[data-document-paper]";

export interface ReturnContext {
  documentId: string;
  chapter: string | null;
  room: string | null;
  line: string | null;
  packageId: string | null;
  lens: string | null;
  filters: Record<string, string>;
  selection: string[];
  /** The nearest identified element around the opener, and where it stood. */
  scrollAnchor: { id: string; top: number } | null;
  scrollY: number;
  initiatingControlId: string | null;
}

export interface ReturnContextInput {
  documentId: string;
  chapter?: string | null;
  room?: string | null;
  line?: string | null;
  packageId?: string | null;
  lens?: string | null;
  filters?: Record<string, string>;
  selection?: string[];
}

let controlSequence = 0;

/** The opener's return id: its own `id` when it has one, else a minted one. */
function markControl(opener: Element | null): string | null {
  if (!(opener instanceof HTMLElement) || opener === document.body) return null;
  const held = opener.getAttribute(RETURN_CONTROL_ATTR);
  if (held) return held;
  controlSequence += 1;
  const id = opener.id || `return-control-${controlSequence}`;
  opener.setAttribute(RETURN_CONTROL_ATTR, id);
  return id;
}

function anchorAround(opener: Element | null): ReturnContext["scrollAnchor"] {
  const anchor = opener?.closest<HTMLElement>("[id]") ?? null;
  if (!anchor) return null;
  return { id: anchor.id, top: anchor.getBoundingClientRect().top };
}

export function captureReturnContext(
  input: ReturnContextInput,
  opener: Element | null,
): ReturnContext {
  return {
    documentId: input.documentId,
    chapter: input.chapter ?? null,
    room: input.room ?? null,
    line: input.line ?? null,
    packageId: input.packageId ?? null,
    lens: input.lens ?? null,
    filters: { ...(input.filters ?? {}) },
    selection: [...(input.selection ?? [])],
    scrollAnchor: anchorAround(opener),
    scrollY: typeof window === "undefined" ? 0 : window.scrollY,
    initiatingControlId: markControl(opener),
  };
}

/** Reads a context back from `history.state`; anything malformed is `null`. */
export function isReturnContext(value: unknown): value is ReturnContext {
  if (!value || typeof value !== "object") return false;
  const ctx = value as Partial<ReturnContext>;
  return (
    typeof ctx.documentId === "string" &&
    typeof ctx.scrollY === "number" &&
    Array.isArray(ctx.selection) &&
    typeof ctx.filters === "object" &&
    ctx.filters !== null
  );
}

export type RestoreOutcome = "control" | "room" | "chapter" | "paper" | "none";

export interface RestoreOptions {
  root?: ParentNode;
  /** Speaks the fallback message in the host's live region. */
  announce?: (message: string) => void;
}

function byAttr(root: ParentNode, attr: string, value: string) {
  return (
    Array.from(root.querySelectorAll<HTMLElement>(`[${attr}]`)).find(
      (el) => el.getAttribute(attr) === value,
    ) ?? null
  );
}

function usable(el: HTMLElement | null): el is HTMLElement {
  return (
    !!el &&
    el.isConnected &&
    isElementRendered(el) &&
    !(el as HTMLButtonElement).disabled &&
    el.getAttribute("aria-disabled") !== "true"
  );
}

function controlFor(root: ParentNode, id: string | null): HTMLElement | null {
  if (!id) return null;
  return byAttr(root, RETURN_CONTROL_ATTR, id) ?? document.getElementById(id);
}

function roomHeadingFor(root: ParentNode, room: string | null) {
  if (!room) return null;
  return roomHeading(root, room) ?? document.getElementById(piecesRoomAnchorId(room));
}

function chapterHeadingFor(root: ParentNode, chapter: string | null) {
  if (!chapter) return null;
  const section = byAttr(root, PAPER_CHAPTER_ATTR, chapter);
  return (
    section?.querySelector<HTMLElement>(`[${CHAPTER_HEADING_ATTR}]`) ??
    section?.querySelector<HTMLElement>("h1, h2, h3") ??
    null
  );
}

function restoreScroll(ctx: ReturnContext): void {
  const anchor = ctx.scrollAnchor
    ? document.getElementById(ctx.scrollAnchor.id)
    : null;
  if (anchor && ctx.scrollAnchor) {
    const drift = anchor.getBoundingClientRect().top - ctx.scrollAnchor.top;
    if (drift !== 0) window.scrollBy({ top: drift, behavior: "auto" });
    return;
  }
  window.scrollTo({ top: ctx.scrollY, behavior: "auto" });
}

/** A heading, or the paper, takes focus without joining the tab order. */
function focusHeading(heading: HTMLElement): void {
  if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView?.({ block: "start", behavior: "auto" });
}

/** Said when the recorded opening control is gone. */
export const RETURN_FALLBACK_MESSAGES = {
  room: "The item you opened this from is no longer on the paper. You are back at its room.",
  chapter:
    "The item you opened this from is no longer on the paper. You are back at its chapter.",
  paper:
    "The item you opened this from is no longer on the paper. You are back on the paper.",
} as const;

/** Said when no opening control was recorded (a deep link or a reload). */
export const RETURN_PLACE_MESSAGES = {
  room: "You are back at the room.",
  chapter: "You are back at the chapter.",
  paper: "You are back on the paper.",
} as const;

type FallbackOutcome = keyof typeof RETURN_PLACE_MESSAGES;

/**
 * Puts the reader back. Focus goes to the opening control when it is still
 * on the paper; otherwise to the room's heading, then the chapter's, then the
 * paper root, with a message. Focus never drops to `<body>` by this hand.
 */
export function restoreReturnContext(
  ctx: ReturnContext,
  { root = document, announce }: RestoreOptions = {},
): RestoreOutcome {
  restoreScroll(ctx);
  const control = controlFor(root, ctx.initiatingControlId);
  if (usable(control)) {
    control.focus({ preventScroll: true });
    return "control";
  }
  // A recorded control that is gone is explained; with none recorded, the
  // message says only where the reader now stands.
  const messages = ctx.initiatingControlId
    ? RETURN_FALLBACK_MESSAGES
    : RETURN_PLACE_MESSAGES;
  const rungs: [FallbackOutcome, HTMLElement | null][] = [
    ["room", roomHeadingFor(root, ctx.room)],
    ["chapter", chapterHeadingFor(root, ctx.chapter)],
    ["paper", root.querySelector<HTMLElement>(PAPER_ROOT_SELECTOR)],
  ];
  for (const [outcome, target] of rungs) {
    if (!usable(target)) continue;
    focusHeading(target);
    announce?.(messages[outcome]);
    return outcome;
  }
  return "none";
}
