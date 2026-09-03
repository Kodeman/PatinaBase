/**
 * Supabase persistence adapter for the Help & Guidance System (Sprint 4 / S4-1).
 *
 * Reads + writes `profiles.help_state` JSONB. The blob carries two sub-keys —
 * `tours` (keyed by `tourId`) and `featureAnnouncements` (keyed by
 * `featureKey`). See `types.ts` for the exact shape.
 *
 * Design — synchronous read + async write-through:
 *
 *   The TourController and FeatureAnnouncementCoachmark were authored against
 *   synchronous `get*State` accessors (they read inside a lazy `useState`
 *   initializer so the component renders with the correct state on first
 *   paint). To preserve that contract under Supabase backing we:
 *
 *     1. Hydrate an in-memory cache once on mount via `loadHelpState(...)`.
 *        Until the cache is hydrated, reads return empty / null — same as a
 *        fresh user — which is the right default (we'd rather show a tour
 *        once on a brand-new device than block the entire surface for a
 *        round-trip).
 *
 *     2. Writes update the cache synchronously and schedule an async
 *        Supabase patch via `saveHelpState(...)`. Patches are serialized
 *        through a per-user promise chain so a rapid sequence of
 *        `setTourState(...)` calls during a tour skip + dismiss + complete
 *        never races into a stale-blob overwrite.
 *
 *     3. Failures (network, RLS, schema mismatch) are logged via
 *        console.warn but never throw. The cache remains the source of
 *        truth for the rest of the session; the next mount will retry the
 *        hydrate.
 *
 *  localStorage / UserDefaults sweep on first authenticated mount lives in
 *  the consumer (designer-portal `HelpStateProvider`, iOS `FirstLaunchTour`).
 *  The adapter exposes `migrateLocalToSupabase(...)` to do the heavy lifting
 *  once the consumer knows it's safe to clear local state.
 */

import type {
  HelpStateBlob,
  HelpStateSupabaseClient,
  TourStateBackend,
  FeatureAnnouncementStateBackend,
  MarginNoteStateBackend,
  FirstAuthoredStateBackend,
} from './types'
import type { TourState } from '../proactive/TourController/tourState'
import {
  TOUR_STATE_STORAGE_PREFIX,
  clearLocalTourState,
} from '../proactive/TourController/tourState'
import type { FeatureAnnouncementState } from '../proactive/FeatureAnnouncementCoachmark/featureAnnouncementState'
import { _clearAllFeatureAnnouncementState } from '../proactive/FeatureAnnouncementCoachmark/featureAnnouncementState'

const PROFILES_TABLE = 'profiles'
const HELP_STATE_COLUMN = 'help_state'

/**
 * Load the entire `profiles.help_state` blob for `userId`. Returns `{}` when
 * no row exists, the column is null, or the request fails — the help-system
 * treats absence and failure identically (fresh-user fallback).
 */
export async function loadHelpState(
  client: HelpStateSupabaseClient,
  userId: string,
): Promise<HelpStateBlob> {
  try {
    const { data, error } = await client
      .from(PROFILES_TABLE)
      .select(HELP_STATE_COLUMN)
      .eq('id', userId)
      .single()
    if (error) {
      // Treat any error (missing row, RLS rejection, network) as fresh user.
      if (typeof console !== 'undefined') {
        console.warn(
          `[help-system] loadHelpState: Supabase returned error — falling back to empty state.`,
          error.message,
        )
      }
      return {}
    }
    const blob = data?.help_state
    if (!blob || typeof blob !== 'object') return {}
    return blob
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[help-system] loadHelpState: unexpected throw — falling back to empty state.`,
        err,
      )
    }
    return {}
  }
}

/**
 * Persist the full `profiles.help_state` blob for `userId`. Caller is
 * responsible for merging in-memory updates before calling — this writer
 * always overwrites the whole column. Failures are logged but never thrown.
 */
export async function saveHelpState(
  client: HelpStateSupabaseClient,
  userId: string,
  blob: HelpStateBlob,
): Promise<void> {
  try {
    const { error } = await client
      .from(PROFILES_TABLE)
      .update({ [HELP_STATE_COLUMN]: blob })
      .eq('id', userId)
    if (error && typeof console !== 'undefined') {
      console.warn(
        `[help-system] saveHelpState: Supabase update failed — write dropped.`,
        error.message,
      )
    }
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[help-system] saveHelpState: unexpected throw — write dropped.`,
        err,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cached, write-through backends. One pair per (client, userId) so multi-user
// scenarios (e.g. admin "view as designer") don't cross-contaminate state.
// ─────────────────────────────────────────────────────────────────────────────

interface BackendCache {
  blob: HelpStateBlob
  hydrated: boolean
  pendingWrite: Promise<void>
}

function createCache(): BackendCache {
  return {
    blob: {},
    hydrated: false,
    pendingWrite: Promise.resolve(),
  }
}

/**
 * Schedule an async write to Supabase, serialized behind any previous in-flight
 * write so we never race writes from quick-succession user actions. The cache's
 * `blob` is read at the moment the chained promise actually runs, so the most
 * recent in-memory mutation wins.
 */
function scheduleWrite(
  cache: BackendCache,
  client: HelpStateSupabaseClient,
  userId: string,
): void {
  cache.pendingWrite = cache.pendingWrite
    .catch(() => undefined)
    .then(() => saveHelpState(client, userId, cache.blob))
}

/**
 * Build a `TourStateBackend` that reads / writes through the shared cache and
 * Supabase blob. Pair this with `createSupabaseFeatureAnnouncementBackend` for
 * the same user so both surfaces share one `help_state` blob.
 */
export function createSupabaseTourStateBackend(
  client: HelpStateSupabaseClient,
  userId: string,
  cache: BackendCache,
): TourStateBackend {
  return {
    getTourState(tourId: string): TourState {
      return cache.blob.tours?.[tourId] ?? {}
    },
    setTourState(tourId: string, patch: TourState): void {
      const prevTours = cache.blob.tours ?? {}
      const prev = prevTours[tourId] ?? {}
      const next: TourState = { ...prev, ...patch }
      cache.blob = {
        ...cache.blob,
        tours: { ...prevTours, [tourId]: next },
      }
      scheduleWrite(cache, client, userId)
    },
    clearTourState(tourId: string): void {
      const prevTours = cache.blob.tours
      // No record → nothing to clear (avoid a needless write-through).
      if (!prevTours || !(tourId in prevTours)) return
      const nextTours = { ...prevTours }
      delete nextTours[tourId]
      cache.blob = {
        ...cache.blob,
        tours: nextTours,
      }
      scheduleWrite(cache, client, userId)
    },
  }
}

/**
 * Build a `FeatureAnnouncementStateBackend` that reads / writes through the
 * shared cache.
 */
export function createSupabaseFeatureAnnouncementBackend(
  client: HelpStateSupabaseClient,
  userId: string,
  cache: BackendCache,
): FeatureAnnouncementStateBackend {
  return {
    getFeatureAnnouncementState(featureKey: string): FeatureAnnouncementState | null {
      const entry = cache.blob.featureAnnouncements?.[featureKey]
      if (!entry) return null
      if (typeof entry.dismissedAt !== 'string') return null
      return { dismissedAt: entry.dismissedAt }
    },
    setFeatureAnnouncementState(
      featureKey: string,
      state: FeatureAnnouncementState,
    ): void {
      const prevAnnouncements = cache.blob.featureAnnouncements ?? {}
      cache.blob = {
        ...cache.blob,
        featureAnnouncements: {
          ...prevAnnouncements,
          [featureKey]: { dismissedAt: state.dismissedAt },
        },
      }
      scheduleWrite(cache, client, userId)
    },
  }
}

/**
 * Return shape for `createSupabaseMarginNoteBackend` — the two synchronous
 * accessors that satisfy `MarginNoteStateBackend`, plus a `hydrate()` the
 * caller awaits before installing the backend as "ready" (margin-note.tsx
 * falls back to localStorage until then, and for signed-out sessions — see
 * that file's `hasSeen`).
 */
export interface CreateSupabaseMarginNoteBackendResult extends MarginNoteStateBackend {
  hydrate: () => Promise<Record<string, string>>
  /** Flushes any pending write — `migrateLocalToSupabase` awaits this before
   *  it returns so a caller can trust localStorage is safe to have cleared. */
  flush: () => Promise<void>
}

/**
 * Build a standalone margin-note backend for `userId`. Unlike the tour /
 * feature-announcement pair above, this does not share a cache with
 * `createSupabaseHelpStateBackends` — it keeps its own cache of the FULL
 * `help_state` blob (hydrated once) so its write-through never clobbers
 * sibling sub-keys it never touches, at the cost of not seeing a concurrent
 * write to `tours`/`featureAnnouncements` made through the other cache after
 * this one hydrated. Acceptable for margin notes: they are dismissed by user
 * action, rarely in the same instant as a tour transition, and the adapter's
 * whole design already accepts eventual consistency over strict locking.
 */
export function createSupabaseMarginNoteBackend(
  client: HelpStateSupabaseClient,
  userId: string,
): CreateSupabaseMarginNoteBackendResult {
  const cache = createCache()
  return {
    hasSeen(noteKey: string): boolean {
      return Object.prototype.hasOwnProperty.call(cache.blob.marginNotes ?? {}, noteKey)
    },
    markSeen(noteKey: string): void {
      const prev = cache.blob.marginNotes ?? {}
      if (Object.prototype.hasOwnProperty.call(prev, noteKey)) return
      cache.blob = {
        ...cache.blob,
        marginNotes: { ...prev, [noteKey]: new Date().toISOString() },
      }
      scheduleWrite(cache, client, userId)
    },
    async hydrate(): Promise<Record<string, string>> {
      const blob = await loadHelpState(client, userId)
      cache.blob = {
        ...blob,
        ...cache.blob,
        marginNotes: { ...(blob.marginNotes ?? {}), ...(cache.blob.marginNotes ?? {}) },
      }
      cache.hydrated = true
      return cache.blob.marginNotes ?? {}
    },
    async flush(): Promise<void> {
      await cache.pendingWrite
    },
  }
}

/**
 * Return shape for `createSupabaseFirstAuthoredBackend` — the synchronous
 * accessors that satisfy `FirstAuthoredStateBackend`, plus `hydrate()`/
 * `flush()` for the same reasons `createSupabaseMarginNoteBackend` carries
 * them (see its doc comment).
 */
export interface CreateSupabaseFirstAuthoredBackendResult extends FirstAuthoredStateBackend {
  hydrate: () => Promise<boolean>
  flush: () => Promise<void>
}

/**
 * Build a standalone first-authored backend for `userId` (onboarding Wave 1,
 * L6). Same independent-cache design as `createSupabaseMarginNoteBackend` —
 * it keeps its own cache of the full `help_state` blob (hydrated once) so
 * its write-through never clobbers sibling sub-keys it never touches.
 */
export function createSupabaseFirstAuthoredBackend(
  client: HelpStateSupabaseClient,
  userId: string,
): CreateSupabaseFirstAuthoredBackendResult {
  const cache = createCache()
  return {
    hasAuthored(): boolean {
      return typeof cache.blob.firstAuthoredAt === 'string'
    },
    markAuthored(): void {
      if (typeof cache.blob.firstAuthoredAt === 'string') return
      cache.blob = {
        ...cache.blob,
        firstAuthoredAt: new Date().toISOString(),
      }
      scheduleWrite(cache, client, userId)
    },
    async hydrate(): Promise<boolean> {
      const blob = await loadHelpState(client, userId)
      cache.blob = {
        ...blob,
        ...cache.blob,
        // Server's firstAuthoredAt wins on first hydration; an in-flight
        // local write (set before hydrate resolved) takes precedence.
        firstAuthoredAt: cache.blob.firstAuthoredAt ?? blob.firstAuthoredAt,
      }
      cache.hydrated = true
      return typeof cache.blob.firstAuthoredAt === 'string'
    },
    async flush(): Promise<void> {
      await cache.pendingWrite
    },
  }
}

/**
 * Convenience: build both backends + the cache and hydrate from Supabase in
 * the background. Consumers typically call this once per signed-in mount and
 * pass the backends straight to `setTourStateBackend(...)` /
 * `setFeatureAnnouncementStateBackend(...)`.
 *
 * The returned `hydrate()` returns the Supabase-read promise so the consumer
 * may `await` it before scanning localStorage for the migration sweep. (The
 * backends themselves are usable synchronously — they just return empty
 * state until the hydrate resolves.)
 */
export interface CreateSupabaseBackendsResult {
  tourBackend: TourStateBackend
  featureBackend: FeatureAnnouncementStateBackend
  /** Returns the current in-memory blob — useful for tests + migration. */
  getBlob: () => HelpStateBlob
  /** Hydrates the cache from Supabase. Safe to call multiple times. */
  hydrate: () => Promise<HelpStateBlob>
  /** Flushes any pending write. Useful when the user is about to sign out. */
  flush: () => Promise<void>
}

export function createSupabaseHelpStateBackends(
  client: HelpStateSupabaseClient,
  userId: string,
): CreateSupabaseBackendsResult {
  const cache = createCache()
  return {
    tourBackend: createSupabaseTourStateBackend(client, userId, cache),
    featureBackend: createSupabaseFeatureAnnouncementBackend(
      client,
      userId,
      cache,
    ),
    getBlob: () => cache.blob,
    async hydrate(): Promise<HelpStateBlob> {
      const blob = await loadHelpState(client, userId)
      // Only overwrite if the in-memory cache is still empty — a write that
      // landed during hydration takes precedence (the user already saw the
      // updated state once we wrote it). Conservative merge so we don't lose
      // anything: server keys win for first-time hydration, in-memory keys
      // win over hydration if the user wrote during the round-trip.
      cache.blob = {
        tours: { ...(blob.tours ?? {}), ...(cache.blob.tours ?? {}) },
        featureAnnouncements: {
          ...(blob.featureAnnouncements ?? {}),
          ...(cache.blob.featureAnnouncements ?? {}),
        },
      }
      cache.hydrated = true
      return cache.blob
    },
    async flush(): Promise<void> {
      await cache.pendingWrite
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage → Supabase migration sweep
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan localStorage for any pre-S4-1 help-system state and copy it into the
 * Supabase blob (without clobbering Supabase entries that are already there).
 * Once the write completes, the localStorage entries are removed so the next
 * mount reads cleanly from Supabase.
 *
 * Call this once per authenticated session, after creating the Supabase
 * backends (so the cache already reflects what Supabase has). If the user
 * never installed local state, this is a no-op.
 *
 * Resolves with the count of (tour, featureAnnouncement) entries migrated.
 */
/**
 * Local-storage prefix the designer-portal `MarginNote` primitive
 * (`apps/designer-portal/src/components/document/margin-note.tsx`) writes
 * under. Duplicated here (rather than imported) because the help-system
 * package must not depend on a portal app — keep the two literals in sync.
 */
const MARGIN_NOTE_STORAGE_PREFIX = 'patina:margin-note:'

/**
 * Local-storage key the designer-portal first-authored guard
 * (`apps/designer-portal/src/components/document/help/first-authored-state.ts`)
 * writes under. Duplicated here for the same reason as
 * `MARGIN_NOTE_STORAGE_PREFIX` — the help-system package must not depend on
 * a portal app — keep the two literals in sync.
 */
const FIRST_AUTHORED_STORAGE_KEY = 'patina:first-authored'

export interface MigrationResult {
  toursMigrated: number
  featureAnnouncementsMigrated: number
  marginNotesMigrated: number
  firstAuthoredMigrated: number
}

export async function migrateLocalToSupabase(
  backends: CreateSupabaseBackendsResult,
  marginNoteBackend?: CreateSupabaseMarginNoteBackendResult,
  firstAuthoredBackend?: CreateSupabaseFirstAuthoredBackendResult,
): Promise<MigrationResult> {
  if (typeof window === 'undefined') {
    return {
      toursMigrated: 0,
      featureAnnouncementsMigrated: 0,
      marginNotesMigrated: 0,
      firstAuthoredMigrated: 0,
    }
  }
  let toursMigrated = 0
  let featureAnnouncementsMigrated = 0
  let marginNotesMigrated = 0
  let firstAuthoredMigrated = 0

  // ── Tours: scan all "help-system.tour.*" keys.
  const localTourKeys: { storageKey: string; tourId: string }[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key) continue
      if (!key.startsWith(TOUR_STATE_STORAGE_PREFIX)) continue
      const tourId = key.slice(TOUR_STATE_STORAGE_PREFIX.length)
      if (!tourId) continue
      localTourKeys.push({ storageKey: key, tourId })
    }
  } catch {
    // localStorage walk failed (private mode / quota probe) — give up.
    return { toursMigrated, featureAnnouncementsMigrated, marginNotesMigrated, firstAuthoredMigrated }
  }

  for (const { storageKey, tourId } of localTourKeys) {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) continue
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed !== 'object' || parsed === null) continue
      const local = parsed as TourState
      const existing = backends.tourBackend.getTourState(tourId)
      const alreadyResolved = existing.completed === true || existing.abandoned === true
      if (alreadyResolved) {
        // Supabase already knows. Drop the local copy without merging. Use the
        // localStorage-only clear so we never touch the authoritative Supabase
        // record we're migrating INTO.
        clearLocalTourState(tourId)
        continue
      }
      // Merge local on top of existing so any field present locally wins —
      // this is the "promote local to Supabase" direction.
      backends.tourBackend.setTourState(tourId, { ...existing, ...local })
      toursMigrated += 1
      // localStorage-only clear: dropping the migrated source must NOT clear
      // the Supabase entry we just wrote via setTourState above.
      clearLocalTourState(tourId)
    } catch {
      // One bad entry shouldn't abort the sweep.
    }
  }

  // ── Feature announcements: read the storage map directly so we can mirror
  // every key into Supabase, then clear via the package's internal helper.
  try {
    const raw = window.localStorage.getItem('patina.help.feature_announcement.v1')
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const map = parsed as Record<string, FeatureAnnouncementState>
        for (const [featureKey, state] of Object.entries(map)) {
          if (!state || typeof state.dismissedAt !== 'string') continue
          const existing = backends.featureBackend.getFeatureAnnouncementState(featureKey)
          if (existing) {
            // Supabase already has a dismissedAt — keep the earlier one (the
            // user's "first" dismiss). String compare on ISO-8601 is safe.
            continue
          }
          backends.featureBackend.setFeatureAnnouncementState(featureKey, {
            dismissedAt: state.dismissedAt,
          })
          featureAnnouncementsMigrated += 1
        }
      }
      _clearAllFeatureAnnouncementState()
    }
  } catch {
    // Same defensive posture — the migration must never crash the host.
  }

  // ── Margin notes: scan all "patina:margin-note:*" keys. Independent
  // try/catch so a failure here never aborts the tour/feature-announcement
  // sweeps above. Only runs when the caller passes a margin-note backend
  // (installed once it has hydrated — see help-state-provider.tsx).
  if (marginNoteBackend) {
    try {
      const localNoteKeys: { storageKey: string; noteKey: string }[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (!key) continue
        if (!key.startsWith(MARGIN_NOTE_STORAGE_PREFIX)) continue
        const noteKey = key.slice(MARGIN_NOTE_STORAGE_PREFIX.length)
        if (!noteKey) continue
        localNoteKeys.push({ storageKey: key, noteKey })
      }
      for (const { storageKey, noteKey } of localNoteKeys) {
        if (!marginNoteBackend.hasSeen(noteKey)) {
          marginNoteBackend.markSeen(noteKey)
          marginNotesMigrated += 1
        }
        try {
          window.localStorage.removeItem(storageKey)
        } catch {
          // best-effort — leave the local key rather than crash the sweep.
        }
      }
    } catch {
      // localStorage walk failed (private mode / quota probe) — give up on
      // this sweep only; tours/featureAnnouncements results still return.
    }
  }

  // ── First-authored (FA-1): the one-time `patina:first-authored` local
  // fallback key (written by first-authored-state.ts when a margin-rail
  // write lands before the Supabase backend has hydrated, or while signed
  // out). Independent try/catch, same posture as the margin-note sweep
  // above — write once through the backend, then clear the local key so the
  // once-ever, cross-device contract holds afterward.
  if (firstAuthoredBackend) {
    try {
      const raw = window.localStorage.getItem(FIRST_AUTHORED_STORAGE_KEY)
      if (raw !== null) {
        if (!firstAuthoredBackend.hasAuthored()) {
          firstAuthoredBackend.markAuthored()
          firstAuthoredMigrated += 1
        }
        try {
          window.localStorage.removeItem(FIRST_AUTHORED_STORAGE_KEY)
        } catch {
          // best-effort — leave the local key rather than crash the sweep.
        }
      }
    } catch {
      // localStorage read failed (private mode / quota probe) — give up on
      // this sweep only; the other results still return.
    }
  }

  // Wait for the writes to land before we tell the caller it's safe to declare
  // localStorage authoritative-as-cleared.
  await backends.flush()
  if (marginNoteBackend) {
    await marginNoteBackend.flush()
  }
  if (firstAuthoredBackend) {
    await firstAuthoredBackend.flush()
  }
  return { toursMigrated, featureAnnouncementsMigrated, marginNotesMigrated, firstAuthoredMigrated }
}
