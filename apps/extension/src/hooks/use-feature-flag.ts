import { useEffect, useState } from 'react';
import { getPostHog } from '../lib/analytics';

export interface ExtensionFeatureFlagState {
  value: boolean;
  isLoading: boolean;
}

export function parseExtensionFlagOverride(flagName: string): boolean | undefined {
  const raw = process.env.PLASMO_PUBLIC_FLAG_OVERRIDES;
  if (!raw) return undefined;

  for (const entry of raw.split(',')) {
    const separator = entry.indexOf(':');
    if (separator === -1) continue;
    if (entry.slice(0, separator).trim() !== flagName) continue;
    return entry.slice(separator + 1).trim() === 'true';
  }
  return undefined;
}

/**
 * Fail-closed PostHog flag lookup for extension surfaces.
 *
 * New placement routes remain hidden while the SDK is loading and whenever
 * PostHog is unavailable. The build-time override is only for deterministic
 * local/test builds.
 */
export function useExtensionFeatureFlag(flagName: string): ExtensionFeatureFlagState {
  const override = parseExtensionFlagOverride(flagName);
  const [value, setValue] = useState(override ?? false);
  const [isLoading, setIsLoading] = useState(override === undefined);

  useEffect(() => {
    if (override !== undefined) return;

    const posthog = getPostHog();
    if (!posthog) {
      setValue(false);
      setIsLoading(false);
      return;
    }

    const immediate = posthog.isFeatureEnabled(flagName);
    if (immediate !== undefined) {
      setValue(immediate === true);
      setIsLoading(false);
    }

    const unsubscribe = posthog.onFeatureFlags(() => {
      setValue(posthog.isFeatureEnabled(flagName) === true);
      setIsLoading(false);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [flagName, override]);

  return { value, isLoading };
}
