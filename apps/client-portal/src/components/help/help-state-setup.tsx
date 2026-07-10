'use client';

/**
 * HelpStateSetup — help-desk Wave 1 (T1d)
 *
 * Render-null client component that installs the Supabase-backed help-state
 * persistence (profiles.help_state) for the signed-in client. Without this,
 * coachmark dismissals and tour completion markers are device-local
 * (localStorage) — a homeowner who dismissed the proposal welcome on their
 * phone would see it again on their laptop.
 *
 * Mirrors the designer-portal pattern in
 * apps/designer-portal/src/components/help/first-signin-tour.tsx:
 *   · install the Supabase backends once a user id exists,
 *   · hydrate remote state, then sweep any legacy localStorage state into
 *     Supabase (migrateLocalToSupabase clears the local keys after the sweep),
 *   · on sign-out / unmount, restore the localStorage default so anonymous
 *     sessions keep isolated one-shot semantics.
 *
 * Consumers that render one-shot help surfaces (e.g. the proposal welcome
 * coachmark) should gate on `useHelpStateReady()` so a surface is never
 * shown from cold local state before the cross-device dismissals arrive.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { createBrowserClient, useSession } from '@patina/supabase';
import {
  createSupabaseHelpStateBackends,
  migrateLocalToSupabase,
  setFeatureAnnouncementStateBackend,
  setTourStateBackend,
} from '@patina/help-system';

// ─── Hydration readiness (module-level store) ────────────────────────────────
//
// FeatureAnnouncementCoachmark reads its persisted dismissal exactly once on
// mount. If it mounts before the Supabase backend has hydrated, a dismissal
// made on another device is invisible and the coachmark re-shows. This tiny
// external store lets any surface wait for hydration without new context
// providers or package changes.

let helpStateReady = false;
const listeners = new Set<() => void>();

function markHelpStateReady(): void {
  if (helpStateReady) return;
  helpStateReady = true;
  listeners.forEach((listener) => listener());
}

// Reset readiness on sign-out / user switch so the NEXT session re-gates on its
// own hydration rather than inheriting the prior user's ready=true. Mirrors the
// designer-portal HelpStateProvider, which resets its readiness state on user
// change. Without it, a same-tab User A → User B switch (no full reload) leaves
// the flag true, so B's proposal-welcome coachmark reads its one-shot state
// before B's cross-device dismissals hydrate — re-showing a welcome B already
// dismissed elsewhere, the exact case the readiness gate exists to prevent.
function resetHelpStateReady(): void {
  if (!helpStateReady) return;
  helpStateReady = false;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * True once the Supabase help-state backend has hydrated (or hydration
 * failed and we fell back to empty state — either way, reads are as good as
 * they are going to get). False for anonymous sessions and on the server.
 */
export function useHelpStateReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => helpStateReady,
    () => false,
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function HelpStateSetup() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    const supabaseClient = createBrowserClient();
    const backends = createSupabaseHelpStateBackends(supabaseClient, userId);
    setTourStateBackend(backends.tourBackend);
    setFeatureAnnouncementStateBackend(backends.featureBackend);

    let cancelled = false;
    const setup = async () => {
      try {
        await backends.hydrate();
        await migrateLocalToSupabase(backends);
      } catch (err) {
        // Hydration failure must not crash the host — the backends fall back
        // to empty in-memory state and the next mount retries. Log only.
        if (typeof console !== 'undefined') {
          console.warn(
            '[help-system] HelpStateSetup: Supabase help-state hydration failed',
            err,
          );
        }
      }
      // Don't mark ready if this effect was torn down mid-hydration (sign-out or
      // user switch) — otherwise a stale in-flight hydration from the prior user
      // would flip readiness back to true after the reset below.
      if (!cancelled) markHelpStateReady();
    };
    void setup();

    return () => {
      cancelled = true;
      // On sign-out (unmount or user id change), restore the localStorage
      // default so anon sessions get isolated one-shot semantics. Any queued
      // Supabase writes fire-and-forget through the closed-over client.
      setTourStateBackend(null);
      setFeatureAnnouncementStateBackend(null);
      resetHelpStateReady();
    };
  }, [userId]);

  return null;
}
