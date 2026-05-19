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
