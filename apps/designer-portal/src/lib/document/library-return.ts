import type { LibraryShelfLens } from "@/components/document/rooms/library/library-toolbar";
import type { LibraryCapabilityFilter } from "@/components/document/rooms/library/library-configuration-summary";
import { captureReturnContext, isReturnContext, restoreReturnContext, type ReturnContext } from "./paper/return-context";

export interface LibraryAddress {
  shelf: LibraryShelfLens;
  capability: LibraryCapabilityFilter;
  q: string;
}

export function parseLibraryAddress(params: Pick<URLSearchParams, "get">): LibraryAddress {
  const shelf = params.get("shelf");
  const capability = params.get("capability");
  return {
    shelf: shelf === "personal" || shelf === "studio" || shelf === "catalog" ? shelf : "all",
    capability: capability === "standard" || capability === "variant" || capability === "configured" || capability === "modular" || capability === "custom" ? capability : "all",
    q: params.get("q") ?? "",
  };
}

/** Preserve placement/origin parameters; defaults keep the old bare Library URL. */
export function libraryHref(params: URLSearchParams, address = parseLibraryAddress(params)): string {
  const next = new URLSearchParams(params);
  next.delete("shelf");
  next.delete("capability");
  next.delete("q");
  if (address.shelf !== "all") next.set("shelf", address.shelf);
  if (address.capability !== "all") next.set("capability", address.capability);
  if (address.q) next.set("q", address.q);
  const query = next.toString();
  return `/library${query ? `?${query}` : ""}`;
}

const STORAGE_KEY = "patina:library-return:v1";
const MAX_AGE = 120_000;

export function rememberLibraryReturn(opener: HTMLElement): void {
  const address = libraryHref(new URLSearchParams(window.location.search));
  const context = captureReturnContext({
    documentId: "library",
    filters: {
      address,
      expanded: String(!!document.querySelector('[aria-controls="library-shelf-panel-plates"][aria-expanded="true"]')),
    },
  }, opener);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), context }));
  } catch { /* Navigation still works when session storage is unavailable. */ }
}

/** A return belongs to the next Library visit only, never a later matching visit. */
export function takeLibraryReturn(): ReturnContext | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const { at, context } = JSON.parse(raw);
    if (!isReturnContext(context) || context.documentId !== "library" || Date.now() - at > MAX_AGE) return null;
    return context.filters.address === libraryHref(new URLSearchParams(window.location.search)) ? context : null;
  } catch { return null; }
}

/** Wait for a cold shelf/search result, but never take the reader's place back. */
export function restoreLibraryReturn(context: ReturnContext, timeout = 3000): () => void {
  let frame = 0;
  let stopped = false;
  const deadline = performance.now() + timeout;
  // Navigation scroll/focus is not reader input. A press (including a
  // scrollbar drag) or key cancels before any focus or scroll it causes.
  const events = ["pointerdown", "touchmove", "wheel", "keydown"] as const;
  const stop = () => {
    stopped = true;
    window.cancelAnimationFrame(frame);
    for (const event of events) window.removeEventListener(event, stop, true);
  };
  let restored: HTMLElement | null = null;
  const attempt = () => {
    if (stopped) return;
    const control = context.initiatingControlId ? document.getElementById(context.initiatingControlId) : null;
    if (control && control.getClientRects().length > 0) {
      const anchor = context.scrollAnchor;
      // Search results above the card and the router's own scroll can settle
      // after it mounts. Follow its anchor only until the reader takes over.
      if (control !== restored || (anchor && control.getBoundingClientRect().top !== anchor.top)) {
        restoreReturnContext(context);
        restored = control;
      }
    }
    if (performance.now() < deadline) frame = window.requestAnimationFrame(attempt);
    else stop();
  };
  for (const event of events) window.addEventListener(event, stop, { capture: true, passive: true });
  frame = window.requestAnimationFrame(attempt);
  return stop;
}
