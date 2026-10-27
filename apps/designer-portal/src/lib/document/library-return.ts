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

const STORAGE_KEY = "patina:library-return:v2";
const ENTRY_KEY = "patinaLibraryEntry";
const MAX_AGE = 30 * 60_000;
interface LibraryReturnRecord { at: number; context: ReturnContext; piece: string }
interface LibraryReturns { entries: Record<string, LibraryReturnRecord> }
const SOURCE_KEY = "patinaLibrarySource";
let pendingSource: string | null = null;
let immediateReturn: { record: LibraryReturnRecord; at: number } | null = null;

function readReturns(): LibraryReturns {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null");
    const entries = Object.fromEntries(Object.entries(stored?.entries ?? {}).filter(([, value]) => {
      const record = value as LibraryReturnRecord;
      return record && Number.isFinite(record.at) && Date.now() - record.at <= MAX_AGE &&
        isReturnContext(record.context) && record.context.documentId === "library" && typeof record.piece === "string";
    })) as LibraryReturns["entries"];
    return { entries };
  } catch { return { entries: {} }; }
}

function writeReturn(record: LibraryReturnRecord): string {
  const stored = readReturns();
  const id = window.history.state?.[ENTRY_KEY] ?? crypto.randomUUID();
  // Pass only our field. Next copies its own state and keeps ACTION_RESTORE
  // active; spreading __NA/_N would bypass its URL synchronization wrapper.
  window.history.replaceState({ [ENTRY_KEY]: id }, "", window.location.href);
  stored.entries[id] = record;
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); }
  catch { /* Navigation still works when session storage is unavailable. */ }
  return id;
}

export function rememberLibraryReturn(opener: HTMLElement): void {
  const address = libraryHref(new URLSearchParams(window.location.search));
  const context = captureReturnContext({
    documentId: "library",
    chapter: "library",
    filters: {
      address,
      expanded: String(!!document.querySelector('[aria-controls="library-shelf-panel-plates"][aria-expanded="true"]')),
    },
  }, opener);
  pendingSource = writeReturn({ at: Date.now(), context, piece: new URL(opener.getAttribute("href") ?? "", window.location.href).pathname });
}

/** Bind once on piece entry, so revisiting an older piece never borrows a later capture. */
export function bindLibraryReturnSource(): void {
  const source = pendingSource;
  pendingSource = null;
  const record = source ? readReturns().entries[source] : undefined;
  if (record?.piece !== window.location.pathname) return;
  window.history.replaceState({ [SOURCE_KEY]: source }, "", window.location.href);
}

/** The piece's explicit Return creates a new entry, unlike browser traversal. */
export function prepareLibraryReturn(destination: string): void {
  const record = readReturns().entries[window.history.state?.[SOURCE_KEY]];
  immediateReturn = record?.piece === window.location.pathname && record.context.filters.address === destination
    ? { record, at: Date.now() } : null;
}

/** Retain each captured entry independently for repeated Back/Forward. */
export function takeLibraryReturn(): ReturnContext | null {
  const address = libraryHref(new URLSearchParams(window.location.search));
  const pending = immediateReturn;
  immediateReturn = null;
  if (pending && Date.now() - pending.at < 5000 && pending.record.context.filters.address === address) {
    writeReturn(pending.record);
    return pending.record.context;
  }
  const record = readReturns().entries[window.history.state?.[ENTRY_KEY]];
  return record?.context.filters.address === address ? record.context : null;
}

/** Wait for a cold shelf/search result, but never take the reader's place back. */
export function restoreLibraryReturn(
  context: ReturnContext,
  timeout = 3000,
  readsSettled: () => boolean = () => true,
): () => void {
  const outerDeadline = performance.now() + 10_000;
  let restoring = false;
  let frame = 0;
  let stopped = false;
  let deadline: number | undefined;
  // Navigation scroll/focus is not reader input. A press (including a
  // scrollbar drag) or key cancels before any focus or scroll it causes.
  const events = ["pointerdown", "touchmove", "wheel", "keydown", "focusin"] as const;
  const stop = () => {
    stopped = true;
    window.cancelAnimationFrame(frame);
    for (const event of events) window.removeEventListener(event, onInput, true);
  };
  const onInput = () => { if (!restoring) stop(); };
  const restore = () => {
    restoring = true;
    try { return restoreReturnContext(context); }
    finally { restoring = false; }
  };
  let restored: HTMLElement | null = null;
  const attempt = () => {
    if (stopped) return;
    if (performance.now() >= outerDeadline) {
      restore();
      return stop();
    }
    if (!readsSettled()) {
      frame = window.requestAnimationFrame(attempt);
      return;
    }
    deadline ??= performance.now() + timeout;
    const control = context.initiatingControlId ? document.getElementById(context.initiatingControlId) : null;
    if (control && control.getClientRects().length > 0) {
      const anchor = context.scrollAnchor;
      // Search results above the card and the router's own scroll can settle
      // after it mounts. Follow its anchor only until the reader takes over.
      if (control !== restored || (anchor && control.getBoundingClientRect().top !== anchor.top)) {
        if (restore() !== "control") return stop();
        restored = control;
      }
    }
    if (performance.now() < deadline) frame = window.requestAnimationFrame(attempt);
    else {
      if (!restored) restore();
      stop();
    }
  };
  for (const event of events) window.addEventListener(event, onInput, { capture: true, passive: true });
  frame = window.requestAnimationFrame(attempt);
  return stop;
}
