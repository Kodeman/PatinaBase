/**
 * Where a job was opened from (C1 §2 "Return identity", WP-01.4b): the desk
 * card, the library, studio contacts, a measured room, another job, or a
 * deep link. One sessionStorage key, per tab, never synced across tabs. It is
 * a convenience: it carries no authority and no act.
 *
 * It hands off to the return systems that already exist rather than copying
 * them:
 * - The Desk keeps its own scroll and pressed row (`holdDeskPlace`, F6), and
 *   puts them back on a history traversal. A desk origin therefore records no
 *   offset here, only the card's anchor as a focus hint.
 * - A Room's own way back is `room-origin`. This key never writes that one,
 *   so a Library → People hop taken from the job keeps the job as the Room's
 *   destination, and opening a job from a Room keeps the Room's own origin.
 */

import { originLabel } from "@/lib/document/room-origin";

const PAPER_ORIGIN_KEY = "patina:paper-origin:v1";
const PAPER_ORIGIN_CHANGED = 'patina:paper-origin-changed';

/** Same-tab storage writes do not emit a native storage event. */
export function subscribePaperOrigin(docId: string, onChange: () => void): () => void {
  const changed = (event: Event) => {
    const changedDocId = (event as CustomEvent<string | undefined>).detail;
    if (!changedDocId || changedDocId === docId) onChange();
  };
  window.addEventListener(PAPER_ORIGIN_CHANGED, changed);
  return () => window.removeEventListener(PAPER_ORIGIN_CHANGED, changed);
}
export { markDeskReturn, takeDeskReturn } from './desk-return';

/** Origins kept per tab, most recent last. */
const MAX_REMEMBERED = 20;

export type PaperOriginKind =
  | "desk"
  | "library"
  | "people"
  | "room"
  | "document"
  | "studio-overlay"
  | "deep-link";

export interface StudioOverlayState {
  overlay: 'books' | 'post' | 'search';
  subject?: string;
  filter?: string;
  query?: string;
  scrollTop?: number;
  focusKey?: string;
}

export { parseStudioOverlay } from './desk-return';
import { parseStudioOverlay } from './desk-return';

export interface PaperOrigin extends Partial<StudioOverlayState> {
  /** The job this origin belongs to; another job's origin never answers. */
  docId: string;
  kind: PaperOriginKind;
  path: string;
  search: string;
  anchorId: string | null;
  /** `null` where the origin keeps its own place (the Desk). */
  scrollY: number | null;
  focusId: string | null;
  /** Native entry identity, not a guessed history offset. */
  historyKey?: string;
}

export interface PaperOriginInput {
  path: string;
  search?: string;
  anchorId?: string | null;
  focusId?: string | null;
  studioOverlay?: StudioOverlayState;
}

function under(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function paperOriginKind(path: string): PaperOriginKind {
  if (path === "/desk" || path === "/") return "desk";
  if (under(path, "/library")) return "library";
  if (under(path, "/people")) return "people";
  if (under(path, "/rooms") || under(path, "/room")) return "room";
  if (under(path, "/doc")) return "document";
  return "deep-link";
}

function isTheJobItself(path: string, docId: string): boolean {
  return under(path.replace(/\/+$/, ""), `/doc/${docId}`);
}

/**
 * Remember where `docId` is being opened from. Moving within the job itself
 * (its sheets, its pieces route, a reload) never overwrites the origin.
 */
export function rememberPaperOrigin(
  docId: string,
  from: PaperOriginInput,
): void {
  if (typeof window === "undefined" || !docId || !from.path) return;
  if (!from.studioOverlay && isTheJobItself(from.path, docId)) return;
  const overlay = from.studioOverlay ? parseStudioOverlay(from.studioOverlay) : null;
  const kind = overlay ? 'studio-overlay' : paperOriginKind(from.path);
  const origin: PaperOrigin = {
    docId,
    kind,
    path: overlay ? '/desk' : from.path,
    search: overlay ? '' : from.search ?? '',
    anchorId: from.anchorId ?? null,
    scrollY: kind === 'desk' || overlay ? null : window.scrollY,
    focusId: from.focusId ?? null,
    ...overlay,
    ...(navigation()?.currentEntry?.key ? { historyKey: navigation()!.currentEntry!.key } : {}),
  };
  try {
    // Most recent last; opening another job never forgets this one's way back.
    const kept = readStore().filter((held) => held.docId !== docId);
    const store = [...kept, origin].slice(-MAX_REMEMBERED);
    window.sessionStorage.setItem(PAPER_ORIGIN_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(PAPER_ORIGIN_CHANGED, { detail: docId }));
  } catch {
    /* private mode / disabled storage — the job returns to the Studio */
  }
}

function deepLink(docId: string): PaperOrigin {
  return {
    docId,
    kind: "deep-link",
    path: "/desk",
    search: "",
    anchorId: null,
    scrollY: null,
    focusId: null,
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseHeld(value: unknown): PaperOrigin | null {
  const held = value as Partial<PaperOrigin> | null;
  if (
    !held ||
    typeof held !== "object" ||
    typeof held.docId !== "string" ||
    typeof held.path !== "string"
  ) {
    return null;
  }
  const overlay = held.kind === 'studio-overlay' ? parseStudioOverlay(held) : null;
  if (held.kind === 'studio-overlay' && !overlay) return deepLink(held.docId);
  return {
    docId: held.docId,
    kind: overlay ? 'studio-overlay' : paperOriginKind(held.path),
    path: overlay ? '/desk' : held.path,
    search: overlay ? '' : typeof held.search === "string" ? held.search : "",
    ...overlay,
    anchorId: nullableString(held.anchorId),
    scrollY: typeof held.scrollY === "number" ? held.scrollY : null,
    focusId: nullableString(held.focusId),
    ...(typeof held.historyKey === 'string' ? { historyKey: held.historyKey } : {}),
  };
}

/** The tab's remembered origins; throws only where storage itself throws. */
function readStore(): PaperOrigin[] {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(window.sessionStorage.getItem(PAPER_ORIGIN_KEY) ?? "[]");
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(parseHeld)
    .filter((held): held is PaperOrigin => held !== null);
}

/** Where `docId` returns to. A job with no remembered origin returns to the Studio. */
export function readPaperOrigin(docId: string): PaperOrigin {
  if (typeof window === "undefined") return deepLink(docId);
  try {
    return readStore().find((held) => held.docId === docId) ?? deepLink(docId);
  } catch {
    return deepLink(docId);
  }
}

export function clearPaperOrigin(docId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (docId) {
      const kept = readStore().filter((origin) => origin.docId !== docId);
      window.sessionStorage.setItem(PAPER_ORIGIN_KEY, JSON.stringify(kept));
    } else {
      window.sessionStorage.removeItem(PAPER_ORIGIN_KEY);
    }
    window.dispatchEvent(new CustomEvent(PAPER_ORIGIN_CHANGED, { detail: docId }));
  } catch {
    /* no-op */
  }
}

export function paperOriginHref(origin: PaperOrigin): string {
  return `${origin.path}${origin.search}`;
}

/** The return control's words: "← Studio", "← Resource library", … */
export function paperOriginLabel(origin: PaperOrigin): string {
  if (origin.kind === "desk" || origin.kind === "deep-link" || origin.kind === 'studio-overlay') return "Studio";
  if (origin.kind === "people") return "Studio contacts";
  return originLabel(origin.path);
}

interface PaperNavigation {
  currentEntry?: { key: string; index: number };
  entries(): { key: string; url: string | null; index: number }[];
}

function navigation(): PaperNavigation | undefined {
  return typeof window === 'undefined' ? undefined :
    (window as Window & { navigation?: PaperNavigation }).navigation;
}

/** Back is safe only when the remembered Studio entry is the predecessor. */
export function canReturnToPaperOrigin(origin: PaperOrigin): boolean {
  const nav = navigation();
  if (origin.kind !== 'desk' || !origin.historyKey || !nav?.currentEntry) return false;
  const previous = nav.entries().find((entry) => entry.index === nav.currentEntry!.index - 1);
  return previous?.key === origin.historyKey &&
    previous.url === new URL(paperOriginHref(origin), window.location.origin).href;
}

/** All three studio sheets keep their own scroll region; the paper never moves. */
export function studioOverlayScroll(root: HTMLElement): HTMLElement {
  return root.closest<HTMLElement>('[data-doc-sheet-scroll-region]') ?? root.querySelector<HTMLElement>('.cmd-scroll') ?? root;
}

/** One bounded landing, yielding to the reader while async rows arrive. */
export function restoreStudioOverlay(root: HTMLElement, held: StudioOverlayState, target: () => HTMLElement | null, onRestored?: () => void): () => void {
  const scroll = studioOverlayScroll(root);
  let frame = 0;
  let stopped = false;
  const hands = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    clearTimeout(deadline);
    hands.forEach((hand) => window.removeEventListener(hand, stop, true));
    document.removeEventListener('focusin', onFocus, true);
  };
  const onFocus = (event: FocusEvent) => {
    // Native sheet/palette open focus precedes this landing, not a reader move.
    if (event.target !== scroll && event.target !== root && !(event.target instanceof HTMLElement && event.target.matches('[data-studio-search-input]'))) stop();
  };
  const land = (last = false) => {
    if (stopped) return;
    const row = target();
    const top = held.scrollTop ?? 0;
    if (!row || (!last && scroll.scrollHeight - scroll.clientHeight < top)) return;
    stop();
    row.focus({ preventScroll: true });
    scroll.scrollTop = top;
    onRestored?.();
  };
  const observer = new MutationObserver(() => land());
  const deadline = window.setTimeout(() => { land(true); stop(); }, 3000);
  hands.forEach((hand) => window.addEventListener(hand, stop, { capture: true, passive: true }));
  document.addEventListener('focusin', onFocus, true);
  // Let the native sheet's opening focus settle first.
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      observer.observe(root, { childList: true, subtree: true });
      land();
    });
  });
  return stop;
}
