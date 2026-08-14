'use client';

/**
 * Armed-bar focus — the Rule's half of the Spine's "Edit dates" wire (B3), made
 * survivable across a remount.
 *
 * The naive version focused the bar on the next animation frame and lost the
 * race in the ordinary case: `armEdit` starts a SMOOTH scroll, the sentinel
 * re-enters the viewport partway through it, the IntersectionObserver flips
 * `pinned`, ScheduleRule's pinned/unpinned ternary unmounts and remounts every
 * bar — and the element the single rAF focused is gone, with nothing to focus
 * its replacement. Focus vanished silently, exactly when the designer had
 * scrolled away and most needed the jump.
 *
 * So the intent is held as PENDING rather than spent immediately: `arm(phaseId)`
 * records the phase and an expiry, and an effect with NO dependency array — it
 * must run after EVERY render, because the render that matters is whichever one
 * the pin flip happens to cause — focuses that phase's bar whenever a NEW
 * element for it appears. Focus therefore lands on whichever instance is
 * mounted once the scroll settles, across any number of pin flips.
 *
 * Two guards keep that from becoming a focus trap:
 *   · `lastEl` — an element is focused ONCE. Re-running the effect on the same
 *     element does nothing, so a designer who clicks elsewhere mid-scroll is
 *     never yanked back, and a bar that refuses focus (hidden, detached) can't
 *     spin the effect against itself.
 *   · `expiresAt` — after ~1.5s the intent is stale and is dropped on the next
 *     render. A phase the Rule can't draw (unplaced, thread lane) never
 *     registers a bar, so its pending focus simply expires unspent instead of
 *     ambushing some later, unrelated remount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long an armed edit stays willing to take focus. Long enough for a smooth
 *  scroll and the pin flip it causes; short enough that a bar which never
 *  arrives can't steal focus from whatever the designer did next. */
export const ARMED_FOCUS_EXPIRY_MS = 1500;

interface PendingFocus {
  phaseId: string;
  expiresAt: number;
  /** The last element this intent focused — the once-per-element guard. */
  lastEl: HTMLElement | null;
}

export interface ArmedBarFocus {
  /** Bars report their root element here, keyed by phase id (null on unmount). */
  registerBarEl: (phaseId: string, el: HTMLElement | null) => void;
  /** Arm the intent: focus this phase's bar as soon as one is mounted. */
  arm: (phaseId: string) => void;
}

export function useArmedBarFocus(expiryMs: number = ARMED_FOCUS_EXPIRY_MS): ArmedBarFocus {
  const barEls = useRef<Map<string, HTMLElement>>(new Map());
  const pending = useRef<PendingFocus | null>(null);
  // The one render `arm` itself needs — every later pass rides a render the
  // Rule was already going to do (the pin flip, a refetch).
  const [, setArmTick] = useState(0);

  const registerBarEl = useCallback((phaseId: string, el: HTMLElement | null) => {
    if (el == null) barEls.current.delete(phaseId);
    else barEls.current.set(phaseId, el);
  }, []);

  const arm = useCallback(
    (phaseId: string) => {
      pending.current = { phaseId, expiresAt: Date.now() + expiryMs, lastEl: null };
      setArmTick((t) => t + 1);
    },
    [expiryMs],
  );

  useEffect(() => {
    const p = pending.current;
    if (p == null) return;
    if (Date.now() > p.expiresAt) {
      pending.current = null; // stale — the bar never came, or the moment passed
      return;
    }
    const el = barEls.current.get(p.phaseId) ?? null;
    if (el == null || el === p.lastEl) return; // nothing NEW to focus yet
    p.lastEl = el;
    el.focus();
  });

  return { registerBarEl, arm };
}
