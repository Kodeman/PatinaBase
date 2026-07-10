/**
 * Tour state persistence — Sprint 3 / Task D2, Sprint 4 / Task S4-1.
 *
 * Stores the per-user, per-tour lifecycle markers that the TourController and
 * any future "show me around again" affordance read on mount.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Backends                                                                │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  • localStorage (default — anon + offline + pre-hydration fallback)      │
 * │    Each tour writes to a single, namespaced key:                         │
 * │      help-system.tour.<tourKey>                                          │
 * │    with a JSON-encoded TourState payload. We intentionally namespace     │
 * │    with a "help-system." prefix so a future global clear or migration    │
 * │    scanner can walk the keyspace without grepping for tour IDs.          │
 * │                                                                          │
 * │  • Supabase (S4-1 — authoritative for signed-in users)                   │
 * │    Lives under `profiles.help_state` JSONB, sub-key `tours`. Wired in    │
 * │    the portal layer via `setTourStateBackend(supabaseTourStateBackend)`. │
 * │    See `../../persistence/supabaseAdapter.ts` for the adapter, and       │
 * │    `apps/designer-portal/src/components/help/first-signin-tour.tsx` for  │
 * │    the wiring pattern.                                                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Spec §4.7 rule 1 ("One-shot per user per surface") calls out: "State
 * persisted in user profile, not localStorage (so it survives device
 * changes)". The Supabase backend delivers that cross-device guarantee; the
 * localStorage backend keeps anonymous and offline sessions one-shot too.
 *
 * The public contract — `getTourState` / `setTourState` / `clearTourState`
 * and the `TourState` type — stays synchronous so the TourController's lazy
 * `useState` initializer keeps working. The Supabase backend hydrates an
 * in-memory cache before consumers mount; until hydration completes, reads
 * return empty (safe default — equivalent to a fresh user).
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

/** Storage key prefix — shared with the migration scanner. */
export const TOUR_STATE_STORAGE_PREFIX = 'help-system.tour.'

/**
 * Backend contract — the injection point for switching between localStorage
 * (default) and Supabase. Both `get` and `set` must be synchronous; backends
 * that need network I/O cache locally and write through asynchronously.
 *
 * Re-exported as a name-stable type from `../../persistence/types.ts` —
 * keeping a copy here keeps the proactive layer importable in isolation from
 * the persistence layer for tests that don't need the Supabase machinery.
 */
export interface TourStateBackend {
  getTourState: (tourKey: string) => TourState
  setTourState: (tourKey: string, patch: TourState) => void
  /**
   * Hard-clear this backend's record for `tourKey`. OPTIONAL — the default
   * localStorage backend needs no implementation (the module-level
   * `clearTourState` wipes the localStorage key directly), so only
   * network-backed backends (Supabase) supply it. When present, the
   * module-level `clearTourState` dispatches here so a replay actually drops
   * the completed/abandoned record from the AUTHORITATIVE store — not just the
   * localStorage fallback. Without it, a signed-in user's persisted result
   * survives `restart()` and the replay silently re-resolves on the next
   * reload/remount.
   */
  clearTourState?: (tourKey: string) => void
}

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

/** Default localStorage-backed read. Never throws. */
function localStorageGetTourState(tourKey: string): TourState {
  if (!hasLocalStorage()) return {}
  try {
    const raw = window.localStorage.getItem(storageKey(tourKey))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as TourState
  } catch {
    return {}
  }
}

/** Default localStorage-backed merge-write. Never throws. */
function localStorageSetTourState(tourKey: string, patch: TourState): void {
  if (!hasLocalStorage()) return
  try {
    const previous = localStorageGetTourState(tourKey)
    const next: TourState = { ...previous, ...patch }
    window.localStorage.setItem(storageKey(tourKey), JSON.stringify(next))
  } catch {
    // Storage quota exceeded or other write failures — silent per spec §13.4
    // (help-system surfaces must never crash the host app).
  }
}

const defaultBackend: TourStateBackend = {
  getTourState: localStorageGetTourState,
  setTourState: localStorageSetTourState,
}

let activeBackend: TourStateBackend = defaultBackend

/**
 * Install a backend for tour state. Portals call this on authenticated mount
 * with a Supabase-backed backend; the call is idempotent and re-installable
 * across sign-in / sign-out boundaries.
 *
 * Passing `null` reinstates the localStorage default — used when the user
 * signs out so subsequent anon sessions get isolated one-shot semantics.
 */
export function setTourStateBackend(backend: TourStateBackend | null): void {
  activeBackend = backend ?? defaultBackend
}

/**
 * Read the persisted state for `tourKey`. Returns an empty object when no
 * state exists OR when the stored payload is malformed — the reader treats
 * "no record" identically to "fresh user". Never throws.
 */
export function getTourState(tourKey: string): TourState {
  return activeBackend.getTourState(tourKey)
}

/**
 * Merge-write the persisted state for `tourKey`. Reads the existing payload
 * first so callers can pass partial updates (e.g. `{ completed: true,
 * completedAt: ... }`) without clobbering sibling fields. No-op when
 * storage is unavailable. Never throws.
 */
export function setTourState(tourKey: string, patch: TourState): void {
  activeBackend.setTourState(tourKey, patch)
}

/**
 * Clear ONLY the localStorage record for a tour. This is the localStorage-only
 * clear used by the localStorage → Supabase migration sweep, which wants to
 * drop its source key WITHOUT touching the (already-written) Supabase record.
 * Never throws.
 */
export function clearLocalTourState(tourKey: string): void {
  if (hasLocalStorage()) {
    try {
      window.localStorage.removeItem(storageKey(tourKey))
    } catch {
      // Ignore — see setTourState.
    }
  }
}

/**
 * Hard-clear persisted state for a tour across BOTH the localStorage fallback
 * AND the active backend. Intended for the "Show me around again" replay
 * affordance (spec §4.7 rule 5) and for tests. After this runs, `getTourState`
 * returns `{}` under any installed backend, so a replay is not silently
 * re-resolved on the next mount/reload.
 *
 * The localStorage key is always cleared. When a network-backed backend
 * (Supabase — installed for signed-in users via `setTourStateBackend`)
 * supplies a `clearTourState`, the record is also dropped there and a
 * write-through scheduled. Without this dispatch a signed-in designer's
 * completed/abandoned record survived `restart()`, so a mid-replay reload
 * re-read `{completed:true}` from Supabase and the replay vanished. Never
 * throws.
 */
export function clearTourState(tourKey: string): void {
  clearLocalTourState(tourKey)
  try {
    activeBackend.clearTourState?.(tourKey)
  } catch {
    // A backend clear failure must not crash the host — same posture as
    // setTourState. The localStorage key is already gone.
  }
}

/**
 * Test-only: reset the active backend to the localStorage default. Used by
 * vitest setup hooks so each test starts from a known state.
 */
export function _resetTourStateBackendForTests(): void {
  activeBackend = defaultBackend
}
