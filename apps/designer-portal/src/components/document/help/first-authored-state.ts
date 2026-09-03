/**
 * First-authored guard (onboarding Wave 1, L6) — same singleton pattern as
 * `margin-note.tsx`'s `setMarginNoteStateBackend`: one Supabase-backed
 * backend per signed-in session, installed by `HelpStateProvider`, with a
 * localStorage fallback before hydration and for signed-out sessions.
 *
 * Guards `document_first_authored` (synthesis §10) — the handoff's
 * activation signal — so it fires exactly once per person, cross-device,
 * on their first successful margin-rail write (a note or a decision).
 */

import type { FirstAuthoredStateBackend } from '@patina/help-system';

const STORAGE_KEY = 'patina:first-authored';

// Module-level singleton, same pattern as margin-note.tsx's `backend`.
let backend: FirstAuthoredStateBackend | null = null;
let backendHydrated = false;

/**
 * Install (or clear) the Supabase-backed first-authored backend. Called by
 * `HelpStateProvider`: once, unhydrated, right after building the backend;
 * again with `hydrated: true` once its `hydrate()` resolves; and with `null`
 * on sign-out so a subsequent anonymous session falls back to localStorage.
 */
export function setFirstAuthoredStateBackend(
  next: FirstAuthoredStateBackend | null,
  hydrated = false,
): void {
  backend = next;
  backendHydrated = next ? hydrated : false;
}

function localHasBeenAuthored(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** True once this person has ever completed a margin-rail write. Reads
 *  through the installed Supabase backend once hydrated; otherwise falls
 *  back to localStorage. Treats a disabled/blocked store as "authored" so
 *  the event never double-fires where we cannot honor the once-only
 *  contract. */
export function hasBeenAuthored(): boolean {
  if (backend && backendHydrated) {
    try {
      return backend.hasAuthored();
    } catch {
      // Fall through to localStorage — a live backend that throws should not
      // crash the surface it sits on.
    }
  }
  return localHasBeenAuthored();
}

/** Mark this person as having authored — writes through the installed
 *  Supabase backend once hydrated (cross-device); otherwise localStorage
 *  only. Best-effort; never throws. */
export function markFirstAuthored(): void {
  if (backend && backendHydrated) {
    try {
      backend.markAuthored();
      return;
    } catch {
      // Fall through to localStorage — same defensive posture as hasBeenAuthored.
    }
  }
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* private mode / storage disabled — best-effort. */
  }
}
