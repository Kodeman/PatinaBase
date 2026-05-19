'use client'

/**
 * featureAnnouncementState — localStorage persistence for one-shot feature
 * announcement coachmarks.
 *
 * Each entry is keyed by `featureKey` (e.g. `"v2-batch-tagging"`). When a user
 * dismisses an announcement the entry records `dismissedAt` so subsequent
 * mounts can render nothing without re-showing the coachmark.
 *
 * Schema is intentionally identical in shape to the D2 `tourState` module so
 * the two can be consolidated into a single help-system persistence layer once
 * Sprint 3 integration lands. Until then, the modules sit side-by-side to keep
 * the parallel agents fully unblocked.
 *
 * TODO: consolidate with D2 tourState module after Sprint 3 integration. The
 * canonical layer should expose `getHelpDismissalState`/`setHelpDismissalState`
 * keyed by `{ kind: 'tour' | 'feature', key: string }` so all proactive
 * surfaces share one storage namespace.
 *
 * Storage envelope:
 *   localStorage key: "patina.help.feature_announcement.v1"
 *   value: JSON-encoded map<featureKey, FeatureAnnouncementState>
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

/**
 * Reads the persisted state for a single feature key. Returns null when no
 * entry exists or storage is unavailable.
 */
export function getFeatureAnnouncementState(
  featureKey: string,
): FeatureAnnouncementState | null {
  const map = readMap()
  const entry = map[featureKey]
  if (!entry || typeof entry !== 'object') return null
  if (typeof entry.dismissedAt !== 'string') return null
  return { dismissedAt: entry.dismissedAt }
}

/**
 * Writes (or overwrites) the persisted state for a single feature key. Other
 * keys are preserved. Failures (storage unavailable / quota) are silent.
 */
export function setFeatureAnnouncementState(
  featureKey: string,
  state: FeatureAnnouncementState,
): void {
  const map = readMap()
  map[featureKey] = { dismissedAt: state.dismissedAt }
  writeMap(map)
}

/**
 * Clears a single feature key's persisted state. Primarily useful for tests
 * and for the "show me around again" profile re-trigger pathway.
 */
export function clearFeatureAnnouncementState(featureKey: string): void {
  const map = readMap()
  if (!(featureKey in map)) return
  delete map[featureKey]
  writeMap(map)
}

/** Internal — exported for test cleanup only. Not part of the public API. */
export function _clearAllFeatureAnnouncementState(): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
