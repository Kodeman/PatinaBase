'use client';

import { useEffect, useState } from 'react';
import { posthog, isAnalyticsEnabled } from '@/lib/analytics/posthog';

/**
 * Resolved state for a PostHog feature flag.
 *
 * `value` is the boolean flag value (false until PostHog responds).
 * `isLoading` is true until either:
 *   - PostHog's `onFeatureFlags` callback fires for the first time, OR
 *   - PostHog returns a cached/synchronous flag value (hydrated from a
 *     previous session — see `isFeatureEnabled` immediate-check below), OR
 *   - PostHog is disabled in this environment (no key, DNT, dev mode without
 *     the dev-override env). In that case we stop loading immediately and
 *     stay fail-closed.
 *
 * Consumers that want to avoid a fail-closed flash before the network
 * responds should render a skeleton/null when `isLoading` is true and only
 * branch on `value` after loading resolves. See
 * `/portal/procurement/layout.tsx` for the canonical pattern.
 *
 * (W3.5.5 HIGH-2.)
 */
export interface FeatureFlagState {
  /** Resolved flag value — false until PostHog responds. */
  value: boolean;
  /** True while the very first PostHog response is in flight. */
  isLoading: boolean;
}

/**
 * Parses `NEXT_PUBLIC_FLAG_OVERRIDES` (format: `flag-a:true,flag-b:false`,
 * comma-separated, entries trimmed) and returns the override for `flagName`,
 * or `undefined` when the flag is not present in the list.
 *
 * Used by e2e/CI runs where PostHog never resolves (no key / blocked
 * network) and the suite needs gated UI deterministically on or off —
 * playwright.config.ts sets `procurement-workspace-pilot:true` in its
 * webServer env. NEXT_PUBLIC_ vars are inlined at build/dev start, so the
 * override is identical on server and client (no hydration mismatch) but
 * cannot change without restarting the dev server.
 */
export function parseFlagOverride(flagName: string): boolean | undefined {
  // Must stay a static `process.env.NEXT_PUBLIC_*` member expression so
  // Next.js can inline it into the client bundle.
  const raw = process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
  if (!raw) return undefined;

  for (const entry of raw.split(',')) {
    const [name, value] = entry.split(':').map((part) => part.trim());
    if (name === flagName) return value === 'true';
  }
  return undefined;
}

/**
 * Returns the resolved state of a PostHog feature flag.
 *
 * Behavior:
 *   - If the flag is listed in `NEXT_PUBLIC_FLAG_OVERRIDES`, resolves
 *     immediately with the override value (`isLoading: false`) and never
 *     consults PostHog. E2E/CI escape hatch — see `parseFlagOverride`.
 *   - Subscribes to PostHog's `onFeatureFlags` event so `value` updates when
 *     flags resolve from the network. The first callback also flips
 *     `isLoading` to false.
 *   - Defaults to `{ value: false, isLoading: true }` so gated features do
 *     not "flash visible" before PostHog has loaded. Pilot designers
 *     deep-linking into a gated route should render a brief skeleton (or
 *     null) until loading resolves rather than seeing a fail-closed
 *     "Coming soon" flash.
 *   - When PostHog is not initialized (no key, dev mode, or DNT), the
 *     callback never fires; in that case `isLoading` is forced to false
 *     immediately so consumers don't hang on a skeleton forever — the
 *     stable state is `{ value: false, isLoading: false }`.
 *   - SSR-safe: returns `{ value: false, isLoading: true }` on the server.
 *     The first effect on the client resolves the loading state.
 *
 * The dossier §6 spec calls for a fail-open default. For the
 * procurement-workspace pilot the desired UX is to hide the zone for the
 * 99% of users who are NOT pilot designers — fail-closed is the safer
 * default for this use, with the loading skeleton avoiding the
 * fail-closed flash for the 1% pilot cohort.
 */
export function useFeatureFlag(flagName: string): FeatureFlagState {
  // Env override resolves before (instead of) the PostHog path. The env var
  // is build-time constant, so the initial state is stable across renders
  // and identical between SSR and hydration.
  const override = parseFlagOverride(flagName);
  const [value, setValue] = useState<boolean>(override ?? false);
  const [isLoading, setIsLoading] = useState<boolean>(override === undefined);

  useEffect(() => {
    if (override !== undefined) return;
    if (typeof window === 'undefined') return;

    if (!isAnalyticsEnabled()) {
      // PostHog will never resolve in this environment — stop loading
      // immediately so consumers render the fail-closed default rather
      // than hanging on a skeleton forever.
      setIsLoading(false);
      return;
    }

    // Check immediately in case flags are already loaded from a previous
    // session (PostHog persists flag values across page loads). If the SDK
    // can answer right away, we're no longer loading.
    const immediate = posthog.isFeatureEnabled(flagName);
    if (immediate !== undefined) {
      setValue(immediate === true);
      setIsLoading(false);
    }

    // Subscribe to flag-change events. The returned value is the unsubscribe
    // function in posthog-js >= 1.x; older versions return void, hence the
    // typeof check in the cleanup.
    const unsubscribe = posthog.onFeatureFlags(() => {
      const next = posthog.isFeatureEnabled(flagName);
      setValue(next === true);
      setIsLoading(false);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [flagName, override]);

  return { value, isLoading };
}
