'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  posthog,
  isAnalyticsEnabled,
  isAnalyticsPossible,
  onAnalyticsInit,
} from '@/lib/analytics/posthog';
import { parseFlagOverride, type FeatureFlagState } from './use-feature-flag';

export type FeatureFlagStates = Record<string, FeatureFlagState>;

function initialStates(names: readonly string[]): FeatureFlagStates {
  const states: FeatureFlagStates = {};
  for (const name of names) {
    const override = parseFlagOverride(name);
    states[name] =
      override === undefined
        ? { value: false, isLoading: true }
        : { value: override, isLoading: false };
  }
  return states;
}

function sameStates(a: FeatureFlagStates, b: FeatureFlagStates): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) => b[key] && a[key].value === b[key].value && a[key].isLoading === b[key].isLoading,
  );
}

/**
 * `useFeatureFlag` for several flags at once, with the same fail-closed rule:
 * each flag starts `{ value: false, isLoading: true }` (or its
 * `NEXT_PUBLIC_FLAG_OVERRIDES` value, resolved), resolves from PostHog's
 * cached answer or its first `onFeatureFlags` callback, waits on
 * `onAnalyticsInit` when PostHog is coming but not up yet, and settles
 * `{ value: false, isLoading: false }` when PostHog can never run here.
 * See `use-feature-flag.ts` for the init-race rationale.
 *
 * The returned object keeps its identity for a given names tuple until a
 * flag's value or loading state actually changes.
 */
export function useFeatureFlags(names: readonly string[]): FeatureFlagStates {
  const namesKey = JSON.stringify(names);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content, not array identity
  const initial = useMemo(() => initialStates(names), [namesKey]);
  const [resolved, setResolved] = useState<{ key: string; states: FeatureFlagStates }>({
    key: namesKey,
    states: initial,
  });

  useEffect(() => {
    const pending = Object.keys(initial).filter((name) => initial[name].isLoading);
    if (pending.length === 0) return;
    if (typeof window === 'undefined') return;

    let active = true;
    let unsubscribeFlags: (() => void) | undefined;

    const apply = (read: (name: string) => FeatureFlagState | undefined) => {
      if (!active) return;
      setResolved((prev) => {
        const base = prev.key === namesKey ? prev.states : initial;
        const next: FeatureFlagStates = { ...base };
        for (const name of pending) {
          const state = read(name);
          if (state) next[name] = state;
        }
        if (sameStates(base, next)) {
          return prev.key === namesKey ? prev : { key: namesKey, states: initial };
        }
        return { key: namesKey, states: next };
      });
    };

    const readAndSubscribe = () => {
      // PostHog persists flag values across page loads, so it may answer now.
      apply((name) => {
        const immediate = posthog.isFeatureEnabled(name);
        return immediate === undefined ? undefined : { value: immediate === true, isLoading: false };
      });
      const unsubscribe = posthog.onFeatureFlags(() => {
        apply((name) => ({ value: posthog.isFeatureEnabled(name) === true, isLoading: false }));
      });
      if (typeof unsubscribe === 'function') unsubscribeFlags = unsubscribe;
    };

    if (isAnalyticsEnabled()) {
      readAndSubscribe();
      return () => {
        active = false;
        unsubscribeFlags?.();
      };
    }

    if (!isAnalyticsPossible()) {
      // PostHog will never initialize here: settle fail-closed.
      apply(() => ({ value: false, isLoading: false }));
      return () => {
        active = false;
      };
    }

    const unsubscribeInit = onAnalyticsInit(readAndSubscribe);
    return () => {
      active = false;
      unsubscribeInit();
      unsubscribeFlags?.();
    };
  }, [namesKey, initial]);

  return resolved.key === namesKey ? resolved.states : initial;
}

const TEACHING_NOTES_FLAG = 'teaching-notes';

/**
 * Synchronous, fail-closed read of the `teaching-notes` flag for code outside
 * React (the MutationCache boundary subscriber). True only when a
 * `NEXT_PUBLIC_FLAG_OVERRIDES` entry turns it on, or PostHog is up and has
 * loaded flags with `teaching-notes` on. Loading, unreachable or unset → false.
 */
export function isTeachingNotesEnabled(): boolean {
  const override = parseFlagOverride(TEACHING_NOTES_FLAG);
  if (override !== undefined) return override;
  if (!isAnalyticsEnabled()) return false;
  // `isFeatureEnabled` answers undefined until flags have loaded.
  return posthog.isFeatureEnabled(TEACHING_NOTES_FLAG) === true;
}
