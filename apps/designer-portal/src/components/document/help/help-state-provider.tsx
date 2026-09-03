'use client';

/**
 * HelpStateProvider — the (document)-era home for the Supabase help-state
 * backend (R97). The desk world is the only route group, so this is the one
 * install site.
 *
 * On an authenticated mount it:
 *   · installs the Supabase-backed tour, feature-announcement, margin-note,
 *     and first-authored backends so a dismissal/completion/guard propagates
 *     across devices (`profiles.help_state`),
 *   · hydrates the in-memory cache(s) from Supabase,
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
  createSupabaseMarginNoteBackend,
  createSupabaseFirstAuthoredBackend,
  migrateLocalToSupabase,
  setFeatureAnnouncementStateBackend,
  setTourStateBackend,
} from '@patina/help-system';
import { setMarginNoteStateBackend } from '../margin-note';
import { setFirstAuthoredStateBackend } from './first-authored-state';

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
    const marginNoteBackend = createSupabaseMarginNoteBackend(supabaseClient, supabaseUser.id);
    const firstAuthoredBackend = createSupabaseFirstAuthoredBackend(supabaseClient, supabaseUser.id);
    setTourStateBackend(backends.tourBackend);
    setFeatureAnnouncementStateBackend(backends.featureBackend);
    // Installed but not yet hydrated — margin-note.tsx / first-authored-state.ts
    // fall back to localStorage until the hydrated calls below flip them ready.
    setMarginNoteStateBackend(marginNoteBackend, false);
    setFirstAuthoredStateBackend(firstAuthoredBackend, false);

    let cancelled = false;
    const setup = async () => {
      try {
        await backends.hydrate();
        await marginNoteBackend.hydrate();
        await firstAuthoredBackend.hydrate();
        if (!cancelled) {
          setMarginNoteStateBackend(marginNoteBackend, true);
          setFirstAuthoredStateBackend(firstAuthoredBackend, true);
        }
        await migrateLocalToSupabase(backends, marginNoteBackend);
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
      setMarginNoteStateBackend(null);
      setFirstAuthoredStateBackend(null);
      setHelpStateReady(false);
    };
  }, [supabaseUser?.id]);

  return (
    <HelpStateContext.Provider value={{ helpStateReady }}>{children}</HelpStateContext.Provider>
  );
}
