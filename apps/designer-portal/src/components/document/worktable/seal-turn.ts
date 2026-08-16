'use client';

/**
 * The seal turn — one note carried across the R6 redirect.
 *
 * The signing moment already rebinds the URL: an activated proposal's id
 * redirects to its project document. That turn was silent, so the designer
 * arrived on a different table with no account of how. The redirecting page
 * leaves a marker; the project document reads it once, prints the note, and
 * clears it — a reload is a new arrival, not a repeat announcement.
 *
 * sessionStorage, not a query param: the note belongs to this hop in this tab,
 * and a shared or bookmarked URL must not carry it.
 */

const SEAL_TURN_KEY = 'patina:doc-seal-turn';

export function markSealTurn(projectId: string): void {
  if (typeof window === 'undefined' || !projectId) return;
  try {
    window.sessionStorage.setItem(SEAL_TURN_KEY, projectId);
  } catch {
    // A blocked store costs the note, never the redirect.
  }
}

/** True exactly once per marked arrival at `projectId`. */
export function readAndClearSealTurn(projectId: string): boolean {
  if (typeof window === 'undefined' || !projectId) return false;
  try {
    const marked = window.sessionStorage.getItem(SEAL_TURN_KEY);
    if (marked === null) return false;
    window.sessionStorage.removeItem(SEAL_TURN_KEY);
    return marked === projectId;
  } catch {
    return false;
  }
}
