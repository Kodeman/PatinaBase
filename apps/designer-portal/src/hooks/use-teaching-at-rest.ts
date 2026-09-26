'use client';

/**
 * Whether a teaching slot is at rest (return-teaching §2, F3). True only when:
 *  1. no mutation is pending;
 *  2. no composer has focus (input, textarea, select, [contenteditable]);
 *  3. no open `[role="dialog"]` other than `host` (the sheet that hosts the
 *     note is the surface, so it never blocks its own note); with `host`
 *     null, as on the Desk, any open dialog blocks;
 *  4. nothing is registered in the hold registry;
 *  5. anchor and act slots only: 1–4 have held for SETTLE_MS. The Desk slot
 *     does not settle.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { isElementRendered } from '@/components/document/overlays/active-dialog';
import { SETTLE_MS } from '@/lib/teaching/constants';
import { isTeachingHeld, subscribeHolds } from '@/lib/teaching/hold-registry';
import type { TeachingSlot } from '@/lib/teaching/types';

const COMPOSER = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function composerHasFocus(): boolean {
  const active = document.activeElement;
  return active instanceof Element && active.matches(COMPOSER);
}

/** An open dialog other than the host. A dialog that contains `host` is the
 *  host's own frame; a covered (inert, aria-hidden) sheet is not open. */
function dialogBlocks(host: HTMLElement | null): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).some(
    (dialog) => !(host && dialog.contains(host)) && isElementRendered(dialog),
  );
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['role', 'hidden', 'aria-hidden', 'inert'],
  });
  // Focus leaving for nothing lands on <body> only after focusout has fired.
  let blurTimer: ReturnType<typeof setTimeout> | undefined;
  const onFocusOut = () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(onChange, 0);
  };
  document.addEventListener('focusin', onChange);
  document.addEventListener('focusout', onFocusOut);
  const unsubscribeHolds = subscribeHolds(onChange);
  return () => {
    observer.disconnect();
    clearTimeout(blurTimer);
    document.removeEventListener('focusin', onChange);
    document.removeEventListener('focusout', onFocusOut);
    unsubscribeHolds();
  };
}

export function useTeachingAtRest(opts: {
  /** The surface the slot belongs to; the at-rest rules are per surface. */
  surfaceKey: string;
  /** The dialog hosting the note, or null for the Desk page. */
  host: HTMLElement | null;
  slot: TeachingSlot;
}): boolean {
  const { host, slot } = opts;
  const idle = useIsMutating() === 0;
  const getSnapshot = useCallback(
    () => !composerHasFocus() && !dialogBlocks(host) && !isTeachingHeld(),
    [host],
  );
  const calm = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const still = idle && calm;

  const settles = slot !== 'desk';
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!settles) return;
    if (!still) {
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [still, settles]);

  return settles ? still && settled : still;
}
