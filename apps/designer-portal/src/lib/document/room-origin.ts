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
  return 'back';
}

export function isRoomPath(pathname: string): boolean {
  return (
    pathname === '/library' ||
    pathname.startsWith('/library/') ||
    pathname === '/compose' ||
    pathname.startsWith('/compose/') ||
    pathname === '/drafting' ||
    pathname.startsWith('/drafting/')
  );
}
