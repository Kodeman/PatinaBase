'use client';

/**
 * US-34 N12a — the one band-level `saving…` (D2 §6.1, PQ12), mounted once in
 * the (document) layout at the right end of the lens band's height.
 *
 * It follows the same clock as each act: nothing for a write that answers
 * within 400 ms, then `saving…`, held at least 500 ms. It simply disappears
 * when nothing is pending. Never "Saved · 10:42", never a persistent badge.
 * It is a status region kept silent (`aria-live="off"`): each act announces
 * its own result, and a second announcement would only add noise.
 *
 * Offline (PQ15, O3), a tick or edit pauses and saves on reconnect; the band
 * then says so instead of `saving…`. Sends and money never queue: the
 * MutationCache refuses them before any call (lib/react-query.ts).
 *
 * SQ-1012 — on the Document this corner failed both ways: the offline
 * sentence printed over the lens band's right slot and line 2, and at 1440
 * `saving…` sat under the right rail, unseen. Where the lens band is mounted
 * the band prints the words on a line of its own (<BandStatusLine/>, passed
 * as its `statusLine`) and this corner yields them (globals.css). Elsewhere
 * the corner speaks as before.
 *
 * While a write is pending, closing or reloading the tab asks first
 * (data-loss prevention). Background mutations marked `errorSurface:
 * 'silent'` are left out of both: the studio never asked for them.
 */

import { useEffect } from 'react';
import { useIsMutating, type MutationMeta } from '@tanstack/react-query';
import { isWordShowing, useActFeedback } from './use-act-feedback';

export const SAVING_WORD = 'saving…';
export const OFFLINE_WAITING = 'Offline. Ticks and edits will save when you’re back.';

const asked = (mutation: { meta?: MutationMeta }) => mutation.meta?.errorSurface !== 'silent';

export function usePendingWritesGuard(pending: boolean): void {
  useEffect(() => {
    if (!pending) return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older engines show the prompt only when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [pending]);
}

type BandState = 'quiet' | 'saving' | 'offline';

/** The band's one clock: pending writes, the words they owe, and the state. */
function useBandWords(): { pending: number; state: BandState; words: string | null } {
  const pending = useIsMutating({ predicate: asked });
  const paused = useIsMutating({ predicate: (m) => asked(m) && m.state.isPaused });
  const { phase } = useActFeedback({ status: pending > 0 ? 'pending' : 'idle' });
  const state: BandState = paused > 0 ? 'offline' : isWordShowing(phase) ? 'saving' : 'quiet';
  const words = state === 'offline' ? OFFLINE_WAITING : state === 'saving' ? SAVING_WORD : null;
  return { pending, state, words };
}

/** SQ-1012 — the same words on a line of the lens band's own (the Document
 *  passes it as the band's `statusLine`). The line keeps its one-line box
 *  while quiet, as the band's line 1 does (D-B38), so `saving…` coming and
 *  going never moves the band's text; only the offline sentence, wrapping at
 *  the phone's measure, takes a second row. Silent like the corner. */
export function BandStatusLine({ className }: { className?: string }) {
  const { state, words } = useBandWords();
  return (
    <p role="status" aria-live="off" data-band-status={state} className={className}>
      {words}
    </p>
  );
}

export function SavingBand() {
  const { pending, state, words } = useBandWords();
  usePendingWritesGuard(pending > 0);

  return (
    <p
      role="status"
      aria-live="off"
      data-saving-band={state}
      className="pointer-events-none fixed right-4 top-0 z-[5] m-0 flex h-[var(--doc-band-height,56px)] items-center font-mono text-[11px] leading-[1.4] text-[var(--text-muted)]"
    >
      {words}
    </p>
  );
}
