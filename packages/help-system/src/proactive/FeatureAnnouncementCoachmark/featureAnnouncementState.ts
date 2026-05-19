'use client'

/**
 * featureAnnouncementState — persistence for one-shot feature announcement
 * coachmarks. Mirrors the tourState module (Sprint 3 D2 + Sprint 4 S4-1).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Backends                                                                │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  • localStorage (default — anon + offline + pre-hydration fallback)      │
 * │    Storage envelope:                                                     │
 * │      localStorage key: "patina.help.feature_announcement.v1"             │
 * │      value: JSON-encoded map<featureKey, FeatureAnnouncementState>       │
 * │                                                                          │
 * │  • Supabase (S4-1 — authoritative for signed-in users)                   │
 * │    Lives under `profiles.help_state` JSONB, sub-key                      │
 * │    `featureAnnouncements`. Wired in the portal layer via                 │
 * │    `setFeatureAnnouncementStateBackend(supabaseBackend)`.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Each entry is keyed by `featureKey` (e.g. `"v2-batch-tagging"`). When a user
 * dismisses an announcement the entry records `dismissedAt` so subsequent
 * mounts can render nothing without re-showing the coachmark.
 *
 * Failure modes — every accessor is wrapped in a try/catch and silently
 * degrades to "no state" when localStorage is unavailable (SSR, private mode,
 * disabled by user, quota exceeded). Persistence must never throw into a
 * render tree.
 */

const STORAGE_KEY = 'patina.help.feature_announcement.v1'

export interface FeatureAnnouncementState {
  /** ISO timestamp the user dismissed the announcement. */
  dismissedAt: string
}

/**
 * Backend contract — the injection point for switching between localStorage
 * (default) and Supabase. Both methods must be synchronous; the Supabase
 * backend caches locally and writes through asynchronously.
 */
export interface FeatureAnnouncementStateBackend {
  getFeatureAnnouncementState: (featureKey: string) => FeatureAnnouncementState | null
  setFeatureAnnouncementState: (
    featureKey: string,
    state: FeatureAnnouncementState,
  ) => void
}

type StoredMap = Record<string, FeatureAnnouncementState>

/** Returns a Storage instance or null when localStorage is unavailable. */
function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    // Access via property — touching `window.localStorage` can throw in some
    // privacy-mode environments (e.g. Safari with cookies blocked).
    const ls = window.localStorage
    if (!ls) return null
    return ls
  } catch {
    return null
  }
}

/**
 * Reads the full stored map. Returns an empty object on any failure (missing
 * key, malformed JSON, storage unavailable). Never throws.
 */
function readMap(): StoredMap {
  const storage = getStorage()
  if (!storage) return {}
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as StoredMap
  } catch {
    return {}
  }
}

/**
 * Writes the full stored map. Silently swallows errors so a quota-exceeded
 * write cannot crash the UI.
 */
function writeMap(map: StoredMap): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore — quota, privacy mode, or disabled storage
  }
}

/** Default localStorage-backed read. */
function localStorageGetState(featureKey: string): FeatureAnnouncementState | null {
  const map = readMap()
  const entry = map[featureKey]
  if (!entry || typeof entry !== 'object') return null
  if (typeof entry.dismissedAt !== 'string') return null
  return { dismissedAt: entry.dismissedAt }
}

/** Default localStorage-backed write. */
function localStorageSetState(
  featureKey: string,
  state: FeatureAnnouncementState,
): void {
  const map = readMap()
  map[featureKey] = { dismissedAt: state.dismissedAt }
  writeMap(map)
}

const defaultBackend: FeatureAnnouncementStateBackend = {
  getFeatureAnnouncementState: localStorageGetState,
  setFeatureAnnouncementState: localStorageSetState,
}

let activeBackend: FeatureAnnouncementStateBackend = defaultBackend

/**
 * Install a backend for feature announcement state. Portals call this on
 * authenticated mount with a Supabase-backed backend; the call is idempotent
 * and re-installable across sign-in / sign-out boundaries.
 *
 * Passing `null` reinstates the localStorage default.
 */
export function setFeatureAnnouncementStateBackend(
  backend: FeatureAnnouncementStateBackend | null,
): void {
  activeBackend = backend ?? defaultBackend
}

/**
 * Reads the persisted state for a single feature key. Returns null when no
 * entry exists or storage is unavailable.
 */
export function getFeatureAnnouncementState(
  featureKey: string,
): FeatureAnnouncementState | null {
  return activeBackend.getFeatureAnnouncementState(featureKey)
}

/**
 * Writes (or overwrites) the persisted state for a single feature key. Other
 * keys are preserved. Failures (storage unavailable / quota) are silent.
 */
export function setFeatureAnnouncementState(
  featureKey: string,
  state: FeatureAnnouncementState,
): void {
  activeBackend.setFeatureAnnouncementState(featureKey, state)
}

/**
 * Clears a single feature key's persisted state. Primarily useful for tests
 * and for the "show me around again" profile re-trigger pathway.
 *
 * This currently only clears the localStorage entry (anon fallback). When
 * the Supabase backend is active, callers wanting a true "reset" need to
 * also patch `profiles.help_state.featureAnnouncements` to remove the key.
 */
export function clearFeatureAnnouncementState(featureKey: string): void {
  const map = readMap()
  if (!(featureKey in map)) return
  delete map[featureKey]
  writeMap(map)
}

/** Internal — exported for test cleanup and migration. Not part of the public API. */
export function _clearAllFeatureAnnouncementState(): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Test-only: reset the active backend to the localStorage default.
 */
export function _resetFeatureAnnouncementStateBackendForTests(): void {
  activeBackend = defaultBackend
}
