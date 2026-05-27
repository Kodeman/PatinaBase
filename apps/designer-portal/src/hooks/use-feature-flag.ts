'use client';

import { useEffect, useState } from 'react';
import { posthog, isAnalyticsEnabled } from '@/lib/analytics/posthog';

/**
 * Returns the boolean value of a PostHog feature flag.
 *
 * Behavior:
 *   - Subscribes to PostHog's `onFeatureFlags` event so the value updates
 *     when flags resolve from the network.
 *   - Returns `false` on the first render (fail-closed) so gated features
 *     do not "flash visible" before PostHog has loaded. The dossier §6 spec
 *     calls for a fail-open default, but for the procurement-workspace pilot
 *     the desired UX is to hide the zone for the 99% of users who are NOT
 *     pilot designers — fail-closed is the safer default for this use.
 *   - When PostHog is not initialized (no key, dev mode, or DNT), the
 *     callback never fires and the flag remains `false`. To preview the
 *     procurement workspace locally, set
 *     `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true` and add the user's email to
 *     the flag's enabled cohort in the PostHog dashboard.
 *   - SSR-safe: returns `false` on the server (no `window`).
 */
export function useFeatureFlag(flagName: string): boolean {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isAnalyticsEnabled()) return;

    // Check immediately in case flags are already loaded from a previous
    // session (PostHog persists flag values across page loads).
    const immediate = posthog.isFeatureEnabled(flagName);
    if (immediate !== undefined) {
      setEnabled(immediate === true);
    }

    // Subscribe to flag-change events. The returned value is the unsubscribe
    // function in posthog-js >= 1.x; older versions return void, hence the
    // typeof check in the cleanup.
    const unsubscribe = posthog.onFeatureFlags(() => {
      const value = posthog.isFeatureEnabled(flagName);
      setEnabled(value === true);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [flagName]);

  return enabled;
}
