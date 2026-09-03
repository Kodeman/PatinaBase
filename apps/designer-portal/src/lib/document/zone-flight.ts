// Onboarding Wave 1 (L6) — the pure "put-down" decision for the
// `document_zone_flight` stuck signal (synthesis §10, R-b). Extracted out of
// `doc/[id]/page.tsx` so the guard's timing/latch/route logic is testable
// without rendering the page (ZF-2 review finding).

/** A put-down is a genuine exit from THIS document: an explicit action
 * (Esc / "Put down") or a route change to a path that is not this
 * document's own tree (`/doc/<id>` or any `/doc/<id>/...` sub-route —
 * Plans, Spec Book, Boards). A Sheet opening over the document never
 * unmounts the page, so it never reaches this check at all. */
export function isSameDocumentPath(path: string, docId: string): boolean {
  const base = `/doc/${docId}`;
  return path === base || path.startsWith(`${base}/`);
}

export interface ZoneFlightGuardInput {
  /** Milliseconds since this document was picked up. */
  heldMs: number;
  /** Whether a margin-rail note/decision write has happened since pick-up. */
  wrote: boolean;
  /** Whether zone-flight has already fired for this pick-up. */
  alreadyFired: boolean;
  /** The document id this pick-up belongs to. */
  docId: string;
  /**
   * The destination path for a route-away put-down, or `null` for an
   * explicit put-down (the "Put down" action / Esc) that isn't gated on a
   * destination — those are always genuine exits.
   */
  nextPath: string | null;
}

/** Pure decision: should zone-flight fire right now? No side effects, no
 * event dispatch — the caller (`fireZoneFlightIfDue` in `page.tsx`) is
 * responsible for latching `fired`/`wrote`/pick-up time and actually
 * sending the event. */
export function shouldFireZoneFlight({
  heldMs,
  wrote,
  alreadyFired,
  docId,
  nextPath,
}: ZoneFlightGuardInput): boolean {
  if (!docId || alreadyFired || wrote) return false;
  if (heldMs >= 10_000) return false;
  if (nextPath != null && isSameDocumentPath(nextPath, docId)) return false;
  return true;
}
