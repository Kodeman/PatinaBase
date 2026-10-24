import type { PaperOrigin } from './paper-origin';

const DESK_RETURN_KEY = "patina:desk-return:v1";
const DESK_RETURN_TTL_MS = 15_000;

interface DeskReturnIntent {
  docId: string;
  anchor: string;
  at: number;
}

/** Explicit Studio return, including pushes and returns after a job reload. */
export function markDeskReturn(origin: Pick<PaperOrigin, "docId" | "focusId" | "anchorId">): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DESK_RETURN_KEY);
    const anchor = origin.focusId ?? origin.anchorId;
    if (!anchor) return;
    const intent: DeskReturnIntent = { docId: origin.docId, anchor, at: Date.now() };
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
    return { docId: intent.docId, anchor: intent.anchor, at: intent.at };
  } catch {
    return null;
  }
}

