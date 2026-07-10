'use client';

/**
 * HelpStateProvider — the (document)-era home for the Supabase help-state
 * backend (R97). The legacy `first-signin-tour.tsx` installs the same backend
 * inside the old `(portal)` layout; the desk world flipped to default, so the
 * install pattern is re-homed here (that file is left untouched — the two route
 * groups never mount at once, so the two installs never collide).
 *
 * On an authenticated mount it:
 *   · installs the Supabase-backed tour + feature-announcement backends so a
 *     dismissal/completion propagates across devices (`profiles.help_state`),
 *   · hydrates the in-memory cache from Supabase,
 *   · sweeps any localStorage help state into Supabase (one-time migration),
 *   · exposes `{ helpStateReady }` via context so the Desk Walkthrough gate can
 *     wait for the cross-device record before deciding to show anything.
 *
 * On sign-out (unmount / user-id change) it restores the localStorage default
 * so a subsequent anonymous session gets isolated one-shot semantics. Hydration
 * failure never crashes the host — it logs and marks ready so the UI proceeds
 * on the safe empty default (spec §13.4).
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createBrowserClient, useSession } from '@patina/supabase';
import {
  createSupabaseHelpStateBackends,
  migrateLocalToSupabase,
  setFeatureAnnouncementStateBackend,
  setTourStateBackend,
} from '@patina/help-system';

interface HelpStateContextValue {
  /** True once the Supabase help-state cache has hydrated (or failed and fallen
   *  back to empty). Consumers gate first-signin decisions on this so a tour the
   *  user already saw on another device is never re-offered. */
  helpStateReady: boolean;
}

const HelpStateContext = createContext<HelpStateContextValue>({ helpStateReady: false });

/** Read whether the cross-device help state is known yet. */
export function useHelpState(): HelpStateContextValue {
  return useContext(HelpStateContext);
}

export function HelpStateProvider({ children }: { children: ReactNode }) {
  // The underlying Supabase session — read directly (not via @/hooks/use-auth,
  // which strips fields) so the backend install keys off the real user id.
  const { session } = useSession();
  const supabaseUser = session?.user ?? null;

  const [helpStateReady, setHelpStateReady] = useState(false);

  useEffect(() => {
    if (!supabaseUser?.id) return;
    const supabaseClient = createBrowserClient();
    const backends = createSupabaseHelpStateBackends(supabaseClient, supabaseUser.id);
    setTourStateBackend(backends.tourBackend);
    setFeatureAnnouncementStateBackend(backends.featureBackend);

    let cancelled = false;
    const setup = async () => {
      try {
        await backends.hydrate();
        await migrateLocalToSupabase(backends);
      } catch (err) {
        // Hydration failure must not crash the host — the backends fall back to
        // empty in-memory state and the next mount retries. Log only.
        if (typeof console !== 'undefined') {
          console.warn(
            '[help-system] HelpStateProvider: Supabase help-state hydration failed',
            err,
          );
        }
      }
      if (!cancelled) {
        setHelpStateReady(true);
      }
    };
    void setup();

    return () => {
      cancelled = true;
      // On sign-out (unmount with no new user id) restore the localStorage
      // default so anon sessions get isolated one-shot semantics. Also reset the
      // ready flag so a re-signin re-gates on a fresh hydration.
      setTourStateBackend(null);
      setFeatureAnnouncementStateBackend(null);
      setHelpStateReady(false);
    };
  }, [supabaseUser?.id]);

  return (
    <HelpStateContext.Provider value={{ helpStateReady }}>{children}</HelpStateContext.Provider>
  );
}
