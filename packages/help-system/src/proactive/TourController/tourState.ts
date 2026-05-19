/**
 * Tour state persistence — Sprint 3 / Task D2.
 *
 * Stores the per-user, per-tour lifecycle markers that the TourController and
 * any future "show me around again" affordance read on mount.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  v1 backend: localStorage                                                │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Each tour writes to a single, namespaced key:                           │
 * │    help-system.tour.<tourKey>                                            │
 * │  with a JSON-encoded TourState payload. We intentionally namespace with  │
 * │  a "help-system." prefix so a future global clear or migration loop can  │
 * │  scan the keyspace without grepping for tour IDs.                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  v2 backend (Sprint 4 — DEFERRED, see plan §15 cleanup item):            │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Swap localStorage for a Supabase column:                                │
 * │    user_profiles.help_state JSONB  // shape: { [tourKey]: TourState }    │
 * │                                                                          │
 * │  Spec §4.7 rule 1 ("One-shot per user per surface") explicitly calls    │
 * │  out: "State persisted in user profile, not localStorage (so it          │
 * │  survives device changes)". This module exists so the swap is a         │
 * │  one-file change — the TourController itself never imports localStorage. │
 * │                                                                          │
 * │  Migration plan when v2 lands:                                          │
 * │    1. Add a `useTourState` hook that wraps `useQuery` against the        │
 * │       user_profiles row + a debounced `useMutation` for writes.          │
 * │    2. Re-implement `getTourState` and `setTourState` here to read/write  │
 * │       through that hook's cache snapshot (or accept an injected client). │
 * │    3. Keep this localStorage path as the offline / unauthenticated      │
 * │       fallback so anonymous users still get one-shot semantics.          │
 * │    4. On first authenticated mount, scan localStorage for existing      │
 * │       help-system.tour.* keys and upsert them into Supabase, then       │
 * │       delete the localStorage entries (one-time migration).              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The public contract — `getTourState` / `setTourState` / `clearTourState`
 * and the `TourState` type — is what the component code is allowed to use.
 * Nothing else in @patina/help-system should read localStorage directly.
 */

/**
 * Persisted state for a single tour, keyed by `tourKey`. Either `completed`
 * or `abandoned` (mutually exclusive in practice, but the shape doesn't
 * enforce it — the reader treats either flag as "do not auto-start").
 */
export interface TourState {
  /** True once the user reached the final step and `complete()` was called. */
  completed?: boolean
  /** True once the user explicitly skipped the tour. */
  abandoned?: boolean
  /** Zero-based step index the user was on when they skipped. */
  atStep?: number
  /** ISO timestamp of completion. */
  completedAt?: string
  /** ISO timestamp of abandonment. */
  abandonedAt?: string
}

/** Storage key prefix — shared with the future v2 migration scanner. */
export const TOUR_STATE_STORAGE_PREFIX = 'help-system.tour.'

/** Build the full storage key for a given tour. */
function storageKey(tourKey: string): string {
  return `${TOUR_STATE_STORAGE_PREFIX}${tourKey}`
}

/**
 * Returns whether `localStorage` is available + writable. SSR, private
 * Safari, and quota-exceeded scenarios all fall through to the no-op path.
 */
function hasLocalStorage(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const probe = '__help_system_probe__'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/**
 * Read the persisted state for `tourKey`. Returns an empty object when no
 * state exists OR when the stored JSON is malformed — the reader treats
 * "no record" identically to "fresh user". Never throws.
 */
export function getTourState(tourKey: string): TourState {
  if (!hasLocalStorage()) return {}
  try {
    const raw = window.localStorage.getItem(storageKey(tourKey))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as TourState
  } catch {
    // Malformed JSON, storage quota, etc. — fall back to clean slate.
    return {}
  }
}

/**
 * Merge-write the persisted state for `tourKey`. Reads the existing payload
 * first so callers can pass partial updates (e.g. `{ completed: true,
 * completedAt: ... }`) without clobbering sibling fields. No-op when
 * storage is unavailable. Never throws.
 */
export function setTourState(tourKey: string, patch: TourState): void {
  if (!hasLocalStorage()) return
  try {
    const previous = getTourState(tourKey)
    const next: TourState = { ...previous, ...patch }
    window.localStorage.setItem(storageKey(tourKey), JSON.stringify(next))
  } catch {
    // Storage quota exceeded or other write failures — silent per spec §13.4
    // (help-system surfaces must never crash the host app).
  }
}

/**
 * Hard-clear persisted state for a tour. Intended for the future "Show me
 * around again" Profile affordance (spec §4.7 rule 5) and for tests. Never
 * throws.
 */
export function clearTourState(tourKey: string): void {
  if (!hasLocalStorage()) return
  try {
    window.localStorage.removeItem(storageKey(tourKey))
  } catch {
    // Ignore — see setTourState.
  }
}
