'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useSessionUserId } from '@patina/supabase';
import { isAnalyticsPossible, onAnalyticsInit, posthog } from '@/lib/analytics/posthog';
import { parseFlagOverride } from './use-feature-flag';

type Renderer = 'legacy' | 'round8';
type Source = 'override' | 'unavailable' | 'cached' | 'flag' | 'error' | 'timeout' | 'tab';
export type PaperRendererState =
  | { renderer: 'pending'; source?: undefined }
  | { renderer: Renderer; source: Source };

const FLAG = 'designer-paper-round8';
const STORAGE_KEY = 'patina:paper-renderer:v1';
const pending: PaperRendererState = { renderer: 'pending' };
const overrides: Record<string, PaperRendererState> = {
  true: { renderer: 'round8', source: 'override' },
  false: { renderer: 'legacy', source: 'override' },
};

// One decision survives route unmounts, but never crosses a full page load.
let state: PaperRendererState = pending;
let started = false;
let userId: string | null = null;
let reloadGeneration = 0;
let reloadOutstanding = false;
let recordedAnswer: { value: boolean; distinctId: string; generation: number } | null = null;
const listeners = new Set<() => void>();
const cleanups: Array<() => void> = [];

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = () => state;
const getServerSnapshot = () => pending;

function readTabValue() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    // Storage may be blocked or contain an older/malformed value.
    return null;
  }
}

function readTabRenderer(): Renderer | undefined {
  const saved = readTabValue();
  if (!userId || saved?.userId !== userId) return undefined;
  return ['legacy', 'round8'].includes(saved.renderer) ? saved.renderer : undefined;
}

function writeTabRenderer(decision: PaperRendererState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...decision, userId, decidedAt: Date.now() }));
  } catch {
    // The module latch still protects drafts when storage is unavailable.
  }
}

function addCleanup(cleanup: () => void): void {
  if (state.renderer !== 'pending') cleanup();
  else cleanups.push(cleanup);
}

function decide(renderer: Renderer, source: Source): void {
  if (state.renderer !== 'pending') return;
  state = { renderer, source };
  writeTabRenderer(state);
  cleanups.splice(0).forEach((cleanup) => cleanup());
  listeners.forEach((listener) => listener());
}

function fallback(source: 'unavailable' | 'error' | 'timeout'): void {
  const tab = readTabRenderer();
  decide(tab ?? 'legacy', tab ? 'tab' : source);
}

function isIdentified(): boolean {
  return userId !== null && posthog.get_distinct_id() === userId;
}

function decideRecordedAnswer(): void {
  if (
    state.renderer !== 'pending' ||
    !recordedAnswer ||
    reloadOutstanding ||
    recordedAnswer.generation !== reloadGeneration ||
    recordedAnswer.distinctId !== userId ||
    !isIdentified()
  ) return;
  decide(recordedAnswer.value ? 'round8' : 'legacy', 'flag');
}

function readCachedAnswer(): boolean {
  const value = posthog.isFeatureEnabled(FLAG);
  if (value === undefined || !isIdentified()) return false;
  decide(value ? 'round8' : 'legacy', 'cached');
  return true;
}

function watchFlags(): void {
  if (readCachedAnswer()) return;
  addCleanup(posthog.on('featureFlagsReloading', () => {
    reloadGeneration += 1;
    reloadOutstanding = true;
    recordedAnswer = null;
  }));
  addCleanup(posthog.onFeatureFlags((_flags, _variants, context) => {
    // The SDK replays cached flags synchronously without context on subscription.
    // Only an actual flags response can supersede the rejected cached identity.
    if (!context) return;
    if (context.errorsLoading) {
      fallback('error');
      return;
    }
    if (reloadOutstanding) {
      // posthog-js 1.359.1 delivers the old response before its queued identify reload.
      const flags = posthog.featureFlags as unknown as {
        _additionalReloadRequested?: boolean;
        _reloadDebouncer?: ReturnType<typeof setTimeout>;
      };
      if (flags?._additionalReloadRequested !== false || flags._reloadDebouncer) return;
      reloadOutstanding = false;
    }
    const value = posthog.isFeatureEnabled(FLAG);
    if (value === undefined) return;
    recordedAnswer = { value, distinctId: posthog.get_distinct_id(), generation: reloadGeneration };
    // Let identify/reload notifications in this turn invalidate a provisional answer.
    void Promise.resolve().then(decideRecordedAnswer);
  }));
}

function startResolution(): void {
  if (started) return;
  started = true;
  if (!isAnalyticsPossible()) {
    fallback('unavailable');
    return;
  }
  const timer = setTimeout(() => fallback('timeout'), 1500);
  addCleanup(() => clearTimeout(timer));
  try {
    addCleanup(onAnalyticsInit(watchFlags));
  } catch {
    fallback('error');
  }
}

/** Presentation only: the settled renderer never changes while this document is open. */
export function usePaperRenderer(): PaperRendererState {
  const sessionUserId = useSessionUserId();
  const override = parseFlagOverride(FLAG);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (override !== undefined) return;
    userId = sessionUserId;
    startResolution();
    decideRecordedAnswer();
  }, [override, sessionUserId]);

  return override === undefined ? snapshot : overrides[String(override)];
}
