/**
 * Room origin stash (R39 / D14 — "leaving a Room returns you to wherever you
 * were"). A Room is studio-wide, not a project document, so it does not ride the
 * project-scoped time/telemetry path. We stash the surface the designer walked
 * in FROM (the pathname) at the moment of entry, and restore it on exit.
 *
 * Distinct from `rememberDocumentInHand()` (analytics/document-events.ts), which
 * stores the last *engagement id* for R21 flight telemetry — not a route.
 * Session-scoped (sessionStorage): a Room origin is meaningless across tabs and
 * should not survive a fresh session.
 */

const ORIGIN_KEY = 'patina:room-origin';

/** Stash the surface a Room is entered from. No-ops if the origin is itself a
 *  Room (so re-entering never traps you inside the Library). */
export function rememberRoomOrigin(pathname: string | null | undefined): void {
  if (typeof window === 'undefined' || !pathname) return;
  if (isRoomPath(pathname)) return;
  try {
    window.sessionStorage.setItem(ORIGIN_KEY, pathname);
  } catch {
    /* private mode / disabled storage — leaving falls back to the Desk */
  }
}

/** The surface to return to on leaving a Room. Defaults to the Desk. */
export function readRoomOrigin(): string {
  if (typeof window === 'undefined') return '/desk';
  try {
    return window.sessionStorage.getItem(ORIGIN_KEY) || '/desk';
  } catch {
    return '/desk';
  }
}

export function clearRoomOrigin(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ORIGIN_KEY);
  } catch {
    /* no-op */
  }
}

/** A human label for the leave affordance ("← the Desk", "← the document"). */
export function originLabel(origin: string): string {
  if (origin.startsWith('/doc/')) return 'the document';
  if (origin === '/desk' || origin === '') return 'the Desk';
  if (origin === '/library' || origin.startsWith('/library/')) return 'the Library';
  if (origin === '/rooms' || origin.startsWith('/rooms/') || origin.startsWith('/room/')) {
    return 'the Rooms';
  }
  return 'back';
}

export function isRoomPath(pathname: string): boolean {
  return (
    pathname === '/library' ||
    pathname.startsWith('/library/') ||
    pathname === '/compose' ||
    pathname.startsWith('/compose/') ||
    pathname === '/drafting' ||
    pathname.startsWith('/drafting/') ||
    // R107 — the Room View (detail, one room) is excluded the same way
    // library/[id] (a piece) is: nested detail-to-detail hops must not
    // clobber a deeper origin. The Rooms roster (`/rooms`, the index) is
    // deliberately NOT listed here, unlike Library — Library's detail pages
    // return to `/library` via a hardcoded RoomShell `backTo` (see
    // piece-room.tsx), never via this origin-stash, so `/library` being
    // unstashable never bites. The Room View has no such hardcoded backTo
    // for its roster door (only the Document scan door gets one, per
    // (document)/room/[id]/page.tsx) — it relies on this generic stash, so
    // `/rooms` itself MUST be stashable or leaving a room opened from the
    // roster has nothing correct to fall back to (the Phase-2 gate found
    // exactly this: it silently degraded to "← the Desk").
    pathname === '/room' ||
    pathname.startsWith('/room/')
  );
}
