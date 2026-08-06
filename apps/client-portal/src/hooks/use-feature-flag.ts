'use client';

import { useEffect, useState } from 'react';
import {
  posthog,
  isAnalyticsEnabled,
  isAnalyticsPossible,
  onAnalyticsInit,
} from '@/lib/analytics/posthog';

/**
 * Resolved state for a PostHog feature flag.
 *
 * `value` is the boolean flag value (false until PostHog responds).
 * `isLoading` is true until either:
 *   - PostHog's `onFeatureFlags` callback fires for the first time, OR
 *   - PostHog returns a cached/synchronous flag value (hydrated from a
 *     previous session — see the `isFeatureEnabled` immediate-check below), OR
 *   - PostHog is disabled in this environment (no key, DNT, dev mode without
 *     the dev-override env). In that case we stop loading immediately and
 *     stay fail-closed.
 *
 * Fail-closed is the contract here: a client watching their own project must
 * never see gated UI flash in and then vanish. Consumers render today's tree
 * while `isLoading` is true and only branch on `value` once loading resolves.
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
 * Used by e2e/CI runs where PostHog never resolves (no key / blocked network)
 * and the suite needs gated UI deterministically on or off. NEXT_PUBLIC_ vars
 * are inlined at build/dev start, so the override is identical on server and
 * client (no hydration mismatch) but cannot change without restarting the dev
 * server.
 */
export function parseFlagOverride(flagName: string): boolean | undefined {
  // Must stay a static `process.env.NEXT_PUBLIC_*` member expression so
  // Next.js can inline it into the client bundle.
  const raw = process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
  if (!raw) return undefined;

  for (const entry of raw.split(',')) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) continue;
    const name = entry.slice(0, colonIdx).trim();
    const value = entry.slice(colonIdx + 1).trim();
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
 *   - Defaults to `{ value: false, isLoading: true }` so gated features never
 *     flash visible before PostHog has loaded.
 *   - When PostHog can never initialize in this environment (no key, or dev
 *     mode without `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV`), the callback would
 *     never fire; in that case `isLoading` is forced to false immediately so
 *     consumers don't hang forever — the stable state is
 *     `{ value: false, isLoading: false }`.
 *   - SSR-safe: returns `{ value: false, isLoading: true }` on the server.
 *     The first effect on the client resolves the loading state.
 *
 * ## The init race
 *
 * `initPostHog()` runs in an effect at the very top of the tree
 * (`PostHogAnalyticsProvider`), and React runs child effects *before* parent
 * effects. Any consumer mounted under it therefore runs this effect while
 * PostHog is still uninitialized. Reading that as "PostHog is disabled here"
 * and settling `isLoading` false would strand the flag permanently false for
 * the whole session, because the deps (`flagName`, `override`) never change.
 *
 * So we distinguish "not enabled *yet*" from "never enabled here":
 * `isAnalyticsPossible()` is the terminal answer (settle fail-closed), and
 * anything else waits on `onAnalyticsInit()` and then does exactly what the
 * already-initialized path does — immediate check plus `onFeatureFlags`
 * subscription. Cleanup unsubscribes from both.
 */
export function useFeatureFlag(flagName: string): FeatureFlagState {
  // Env override resolves before (instead of) the PostHog path. The env var
  // is build-time constant, so the initial state is stable across renders and
  // identical between SSR and hydration.
  const override = parseFlagOverride(flagName);
  const [value, setValue] = useState<boolean>(override ?? false);
  const [isLoading, setIsLoading] = useState<boolean>(override === undefined);

  useEffect(() => {
    if (override !== undefined) return;
    if (typeof window === 'undefined') return;

    let unsubscribeFlags: (() => void) | undefined;

    // Everything the initialized path does. Called either straight away
    // (PostHog was already up when we mounted) or later, from onAnalyticsInit.
    const readAndSubscribe = () => {
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
      // typeof check.
      const unsubscribe = posthog.onFeatureFlags(() => {
        const next = posthog.isFeatureEnabled(flagName);
        setValue(next === true);
        setIsLoading(false);
      });
      if (typeof unsubscribe === 'function') unsubscribeFlags = unsubscribe;
    };

    if (isAnalyticsEnabled()) {
      readAndSubscribe();
      return () => {
        unsubscribeFlags?.();
      };
    }

    if (!isAnalyticsPossible()) {
      // PostHog will never initialize in this environment (no key, or dev
      // without the opt-in) — stop loading immediately so consumers render the
      // fail-closed default rather than hanging forever.
      setIsLoading(false);
      return;
    }

    // Analytics is coming but hasn't initialized yet — we mounted above
    // initPostHog() in effect order (see the race note above). Wait for it
    // instead of settling permanently false.
    const unsubscribeInit = onAnalyticsInit(readAndSubscribe);

    return () => {
      unsubscribeInit();
      unsubscribeFlags?.();
    };
  }, [flagName, override]);

  return { value, isLoading };
}
