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

export function SavingBand() {
  const pending = useIsMutating({ predicate: asked });
  const paused = useIsMutating({ predicate: (m) => asked(m) && m.state.isPaused });
  const { phase } = useActFeedback({ status: pending > 0 ? 'pending' : 'idle' });
  usePendingWritesGuard(pending > 0);

  const words = paused > 0 ? OFFLINE_WAITING : isWordShowing(phase) ? SAVING_WORD : null;

  return (
    <p
      role="status"
      aria-live="off"
      data-saving-band={words ? (paused > 0 ? 'offline' : 'saving') : 'quiet'}
      className="pointer-events-none fixed right-4 top-0 z-[5] m-0 flex h-[var(--doc-band-height,56px)] items-center font-mono text-[11px] leading-[1.4] text-[var(--text-muted)]"
    >
      {words}
    </p>
  );
}
