/**
 * Shared types for the help-system persistence layer (Sprint 4 / Task S4-1).
 *
 * The persistence layer abstracts the storage of two pieces of per-user state:
 *
 *   • Tour state — keyed by `tourId`, records completion or abandonment so a
 *     tour never auto-starts again. Owned by `TourController` (D2) and the
 *     iOS `FirstLaunchTour` orchestrator (G9).
 *
 *   • Feature-announcement state — keyed by `featureKey`, records when a
 *     coachmark was dismissed so subsequent mounts render nothing. Owned by
 *     `FeatureAnnouncementCoachmark` (D4).
 *
 *   • Margin-note seen state — keyed by `noteKey` (which may carry a
 *     version suffix, e.g. `doc-first-touch@2`), records the ISO instant a
 *     `MarginNote` (designer-portal) was dismissed or acted on so it never
 *     renders again for that person, on any device. Decision 5 (2026-09-03)
 *     amends R94 to let a note re-arm exactly once per version suffix — the
 *     key is matched exactly, so `doc-first-touch@2` is unseen even when
 *     `doc-first-touch` (or `@1`) was already seen.
 *
 * Both surfaces previously wrote to browser `localStorage` (web) or
 * `UserDefaults` (iOS). Sprint 4 moves the authoritative store to the
 * Supabase `profiles.help_state` JSONB column so dismissals propagate across
 * devices. Each per-surface module continues to expose synchronous `getX` /
 * `setX` accessors (calling these from a render path was a deliberate v1
 * design — the lazy initializer reads them once during component mount) so we
 * keep a synchronous in-memory cache backed by an async Supabase read on
 * hydration and an async write-through on every set.
 *
 * Local storage stays as the anon / offline fallback. The Supabase backend
 * only activates when the consumer wires it via `setTourStateBackend(...)`
 * (and similarly for feature announcements).
 */

import type { TourState } from '../proactive/TourController/tourState'
import type { FeatureAnnouncementState } from '../proactive/FeatureAnnouncementCoachmark/featureAnnouncementState'

/**
 * Combined JSONB shape stored at `profiles.help_state`. Both subkeys are
 * optional so a fresh user starts with `{}` (the migration's DEFAULT) and the
 * adapter never has to write a stub before the first real entry.
 */
export interface HelpStateBlob {
  tours?: Record<string, TourState>
  featureAnnouncements?: Record<string, FeatureAnnouncementState>
  /** `noteKey` → ISO instant seen (dismissed or acted). See decision 5. */
  marginNotes?: Record<string, string>
  /**
   * ISO instant of this person's first successful write (a margin note or a
   * decision) into any document, ever. Onboarding Wave 1 (L6) — guards
   * `document_first_authored` so the handoff's activation signal fires
   * exactly once per person, cross-device, never re-armed (unlike the
   * version-suffixed `marginNotes` keys — there is no "new version" of a
   * first write).
   */
  firstAuthoredAt?: string
}

/**
 * Backend contract for tour state. The default backend is localStorage; the
 * Supabase backend is installed by portals once the user is authenticated.
 *
 * Reads MUST be synchronous because the `TourController` calls them inside a
 * lazy `useState` initializer. Writes can be fire-and-forget — the backend
 * may persist asynchronously, but the in-memory cache must reflect the write
 * immediately so the next render sees the new state.
 */
export interface TourStateBackend {
  getTourState: (tourId: string) => TourState
  setTourState: (tourId: string, patch: TourState) => void
  /**
   * Hard-clear this backend's record for `tourId`. OPTIONAL — only
   * network-backed backends (Supabase) implement it; the localStorage default
   * is cleared directly by the module-level `clearTourState`. The
   * `TourController` replay path dispatches here so a completed/abandoned
   * record is dropped from the authoritative store, not just localStorage.
   */
  clearTourState?: (tourId: string) => void
}

/**
 * Backend contract for feature announcement state. Same synchronous-read /
 * write-through-cache requirements as `TourStateBackend`.
 */
export interface FeatureAnnouncementStateBackend {
  getFeatureAnnouncementState: (featureKey: string) => FeatureAnnouncementState | null
  setFeatureAnnouncementState: (
    featureKey: string,
    state: FeatureAnnouncementState,
  ) => void
}

/**
 * Backend contract for margin-note seen state (R94, amended by decision 5).
 * Reads are synchronous — the designer-portal `MarginNote` primitive checks
 * `hasSeen` during its reveal effect. `noteKey` is matched exactly (no
 * version-suffix stripping) so a `@N`-suffixed key is a distinct record from
 * its unsuffixed or previous-version sibling.
 */
export interface MarginNoteStateBackend {
  hasSeen: (noteKey: string) => boolean
  markSeen: (noteKey: string) => void
}

/**
 * Backend contract for the first-authored guard (onboarding Wave 1, L6).
 * Same synchronous-read / write-through-cache requirements as the other
 * backends. `markAuthored` is idempotent — once `firstAuthoredAt` is set it
 * is never overwritten.
 */
export interface FirstAuthoredStateBackend {
  hasAuthored: () => boolean
  markAuthored: () => void
}

/**
 * Minimal contract the Supabase backend needs out of the Supabase client.
 * Decouples the help-system from a hard `@supabase/supabase-js` dependency —
 * the consumer passes whichever client (browser, server, ssr) it already has.
 *
 * The real `SupabaseClient<Database>` type from `@supabase/supabase-js` has a
 * deeply-generic `from(...)` that returns a TableMethods<...> instance fully
 * typed against the generated Database schema. Re-stating that here would
 * either pin the help-system to a single generated-types version OR drag in
 * the @supabase/postgrest-js TypeScript machinery (which is multi-thousand
 * lines of conditional generics).
 *
 * Instead we use `any` at the seam. The adapter implementation type-narrows
 * each call locally via the response shape it expects from PostgREST. This is
 * the same trade-off the @patina/supabase hooks make elsewhere in the
 * monorepo (use-templates.ts, use-dlq.ts) when crossing into typed-client
 * land from a generic helper.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HelpStateSupabaseClient = any
