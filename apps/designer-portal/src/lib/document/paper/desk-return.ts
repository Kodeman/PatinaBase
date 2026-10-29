import type { StudioOverlayState, PaperOrigin } from './paper-origin';

/** Stored convenience data is untrusted; malformed overlays return to the Desk. */
export function parseStudioOverlay(value: unknown): StudioOverlayState | null {
  if (!value || typeof value !== 'object') return null;
  const held = value as Partial<StudioOverlayState>;
  if (held.overlay !== 'books' && held.overlay !== 'orders' && held.overlay !== 'post' && held.overlay !== 'search') return null;
  for (const key of ['subject', 'filter', 'query', 'focusKey'] as const) {
    if (held[key] !== undefined && typeof held[key] !== 'string') return null;
  }
  if (held.scrollTop !== undefined &&
      (typeof held.scrollTop !== 'number' || !Number.isFinite(held.scrollTop) || held.scrollTop < 0)) return null;
  return {
    overlay: held.overlay,
    ...(held.subject !== undefined ? { subject: held.subject } : {}),
    ...(held.filter !== undefined ? { filter: held.filter } : {}),
    ...(held.query !== undefined ? { query: held.query } : {}),
    ...(held.scrollTop !== undefined ? { scrollTop: held.scrollTop } : {}),
    ...(held.focusKey !== undefined ? { focusKey: held.focusKey } : {}),
  };
}


const DESK_RETURN_KEY = "patina:desk-return:v1";
const DESK_RETURN_TTL_MS = 15_000;

interface DeskReturnIntent {
  docId: string;
  anchor: string;
  at: number;
  studioOverlay?: StudioOverlayState;
}

/** Explicit Studio return, including pushes and returns after a job reload. */
export function markDeskReturn(origin: Pick<PaperOrigin, "docId" | "focusId" | "anchorId"> & Partial<Pick<PaperOrigin, "kind"> & StudioOverlayState>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DESK_RETURN_KEY);
    const studioOverlay = origin.kind === 'studio-overlay' ? parseStudioOverlay(origin) : null;
    const anchor = origin.focusId ?? origin.anchorId ?? (studioOverlay ? 'studio-find' : null);
    if (!anchor) return;
    const intent: DeskReturnIntent = { docId: origin.docId, anchor, at: Date.now(), ...(studioOverlay ? { studioOverlay } : {}) };
    window.sessionStorage.setItem(DESK_RETURN_KEY, JSON.stringify(intent));
  } catch {
    /* storage disabled — navigation still works */
  }
}

/** Cleared on read so an unrelated later Desk visit never takes focus. */
export function takeDeskReturn(): DeskReturnIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DESK_RETURN_KEY);
    window.sessionStorage.removeItem(DESK_RETURN_KEY);
    const held: unknown = raw ? JSON.parse(raw) : null;
    if (!held || typeof held !== "object") return null;
    const intent = held as Partial<DeskReturnIntent>;
    if (typeof intent.docId !== "string" || !intent.docId ||
        typeof intent.anchor !== "string" || !intent.anchor ||
        typeof intent.at !== "number" || !Number.isFinite(intent.at)) return null;
    const age = Date.now() - intent.at;
    if (age < 0 || age > DESK_RETURN_TTL_MS) return null;
    const studioOverlay = parseStudioOverlay(intent.studioOverlay);
    return { docId: intent.docId, anchor: intent.anchor, at: intent.at, ...(studioOverlay ? { studioOverlay } : {}) };
  } catch {
    return null;
  }
}

