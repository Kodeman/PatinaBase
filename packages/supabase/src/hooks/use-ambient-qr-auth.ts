'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  usePortalQrAuth,
  type PortalQrAuthFailure,
  type PortalQrAuthState,
} from './use-portal-qr-auth';

/**
 * What the ambient badge is doing, in the terms its art direction cares about.
 * `live` shows a scannable code, `refreshing` is dimmed while a code is on the
 * way, `resting` has stopped asking on its own, `error` is the quiet failure.
 */
export type AmbientQrPhase = 'live' | 'refreshing' | 'resting' | 'error';

export interface AmbientQrAuthOptions {
  /** Empty string means the current portal owns the QR endpoints. */
  baseUrl: string;
  /** Fold the viewport gate in here: disabled means zero network. */
  enabled: boolean;
  /** Silent renewals before the badge rests and waits for a tap. */
  maxAutoRenews?: number;
  /** Quiet period after a rate-limited generate before `wake()` bites. */
  renewBackoffMs?: number;
}

export interface AmbientQrAuthResult {
  phase: AmbientQrPhase;
  qrState: PortalQrAuthState;
  /** Latched: the last code we had, so a refresh dims rather than blanks. */
  qrUrl: string | null;
  secondsRemaining: number;
  totalSeconds: number;
  failure: PortalQrAuthFailure | null;
  /**
   * False while a rate-limited generate is still inside its backoff window —
   * `wake()` would be swallowed. The badge reads this to decide whether to
   * offer a tap at all, so it never promises an action it cannot perform.
   */
  wakeAvailable: boolean;
  /** User asked for a fresh code: resets the renewal budget. */
  wake: () => void;
  /** Another sign-in method took over. */
  cancel: () => void;
}

const DEFAULT_MAX_AUTO_RENEWS = 2;
const DEFAULT_RENEW_BACKOFF_MS = 60_000;

/** Never touched during module evaluation or render — SSR renders no document. */
function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

function toPhase(
  state: PortalQrAuthState,
  renewsUsed: number,
  maxAutoRenews: number,
): AmbientQrPhase {
  switch (state) {
    case 'idle':
    case 'loading':
      return 'refreshing';
    case 'pending':
    case 'verifying':
    case 'authenticated':
      return 'live';
    case 'expired':
      return renewsUsed < maxAutoRenews ? 'refreshing' : 'resting';
    case 'denied':
      return 'resting';
    case 'error':
    default:
      return 'error';
  }
}

/**
 * Policy over the QR transport for an always-visible badge: renew a couple of
 * times, then rest; stop polling while the tab is hidden; back off when the
 * shared rate limiter says no. Every ceiling here exists because the badge is
 * on screen for every sign-in page view, not just for people who open a
 * disclosure.
 */
export function useAmbientQrAuth({
  baseUrl,
  enabled,
  maxAutoRenews = DEFAULT_MAX_AUTO_RENEWS,
  renewBackoffMs = DEFAULT_RENEW_BACKOFF_MS,
}: AmbientQrAuthOptions): AmbientQrAuthResult {
  /**
   * A tab that has never been visible must not generate at all. `document.hidden`
   * is true for a background tab from its very first paint, and the visibility
   * effect below only ever *pauses* an already-started transport — so without
   * this latch a link opened in a background tab spends a generate against the
   * shared limiter for a code nobody will ever look at.
   *
   * It latches: once someone has looked, hide/show reverts to the pause
   * semantics, and the badge is never re-gated behind a second reveal.
   */
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    if (hasBeenVisible) return;
    // No document at all (SSR, node tests) counts as visible: there is nothing
    // to wait for, and `enabled` remains the only gate.
    if (typeof document === 'undefined' || !document.hidden) {
      setHasBeenVisible(true);
      return;
    }
    const reveal = () => {
      if (!document.hidden) setHasBeenVisible(true);
    };
    document.addEventListener('visibilitychange', reveal);
    return () => {
      document.removeEventListener('visibilitychange', reveal);
    };
  }, [hasBeenVisible]);

  const qr = usePortalQrAuth({ baseUrl, enabled: enabled && hasBeenVisible });
  const { state, qrUrl, failure, regenerate, cancel, pausePolling, resumePolling } =
    qr;

  const renewsUsed = useRef(0);
  const deferredRenew = useRef(false);
  const rateLimitedAt = useRef(0);
  const handledExpiry = useRef(false);
  const [latchedUrl, setLatchedUrl] = useState<string | null>(null);
  /** Epoch ms until which `wake()` is a no-op, or 0 when it is free to fire. */
  const [wakeBlockedUntil, setWakeBlockedUntil] = useState(0);

  // Declared first so a re-enable clears the budget before the renewal effect
  // below reads it in the same commit.
  useEffect(() => {
    if (enabled) {
      renewsUsed.current = 0;
      deferredRenew.current = false;
      rateLimitedAt.current = 0;
      setWakeBlockedUntil(0);
      return;
    }
    setLatchedUrl(null);
  }, [enabled]);

  useEffect(() => {
    if (qrUrl) setLatchedUrl(qrUrl);
  }, [qrUrl]);

  useEffect(() => {
    if (state === 'error' && failure?.kind === 'rate_limit') {
      rateLimitedAt.current = Date.now();
      setWakeBlockedUntil(Date.now() + renewBackoffMs);
    }
  }, [state, failure, renewBackoffMs]);

  // A rate-limited badge has no timers of its own left running, so nothing
  // would re-render it when the window closes. This is the one tick it needs:
  // the affordance comes back on its own instead of waiting for a stray render.
  useEffect(() => {
    if (wakeBlockedUntil === 0) return;
    const remaining = wakeBlockedUntil - Date.now();
    if (remaining <= 0) {
      setWakeBlockedUntil(0);
      return;
    }
    const timer = setTimeout(() => setWakeBlockedUntil(0), remaining);
    return () => clearTimeout(timer);
  }, [wakeBlockedUntil]);

  const renew = useCallback(() => {
    handledExpiry.current = true;
    renewsUsed.current += 1;
    deferredRenew.current = false;
    void regenerate();
  }, [regenerate]);

  useEffect(() => {
    // One expiry buys one renewal. Strict Mode's replayed setup, a remount, or
    // any repeated run on the same expired snapshot must not spend the budget
    // twice or fire two generate calls at the shared limiter.
    if (state !== 'expired') {
      handledExpiry.current = false;
      return;
    }
    if (!enabled || handledExpiry.current) return;
    if (renewsUsed.current >= maxAutoRenews) return;
    // A hidden tab burns budget on a code nobody can scan. Hold the renewal
    // until someone is actually looking.
    if (documentHidden()) {
      deferredRenew.current = true;
      return;
    }
    renew();
  }, [enabled, state, maxAutoRenews, renew]);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const syncVisibility = () => {
      if (document.hidden) {
        pausePolling();
        return;
      }
      resumePolling();
      if (deferredRenew.current) {
        if (renewsUsed.current < maxAutoRenews) renew();
        else deferredRenew.current = false;
      }
    };

    document.addEventListener('visibilitychange', syncVisibility);
    // Adopt whatever the current visibility is: a tab that was already hidden
    // when this mounted must not start polling.
    if (document.hidden) pausePolling();
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, [enabled, maxAutoRenews, pausePolling, resumePolling, renew]);

  const wake = useCallback(() => {
    if (
      rateLimitedAt.current !== 0 &&
      Date.now() - rateLimitedAt.current < renewBackoffMs
    ) {
      return;
    }
    rateLimitedAt.current = 0;
    setWakeBlockedUntil(0);
    renewsUsed.current = 0;
    deferredRenew.current = false;
    void regenerate();
  }, [regenerate, renewBackoffMs]);

  return {
    phase: toPhase(state, renewsUsed.current, maxAutoRenews),
    qrState: state,
    qrUrl: qrUrl ?? latchedUrl,
    secondsRemaining: qr.secondsRemaining,
    totalSeconds: qr.totalSeconds,
    failure,
    wakeAvailable: wakeBlockedUntil === 0 || Date.now() >= wakeBlockedUntil,
    wake,
    cancel,
  };
}
