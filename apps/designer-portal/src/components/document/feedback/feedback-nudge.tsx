'use client';

/**
 * Gentle prompt (R7.7) — if she's been quiet a while, a light, dismissible ask
 * of the four questions, sitting just above the capture button. Never blocks;
 * dismissal is remembered locally (single user, low stakes — no migration).
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useFeedback } from '@patina/supabase';
import { useHydrated } from '@/hooks/use-hydrated';
import { openFeedbackSheet } from './feedback-sheet';

const QUIET_DAYS = 4;
const COOLDOWN_DAYS = 3;
const DISMISS_KEY = 'patina.feedback.nudgeDismissedAt';
const DAY_MS = 24 * 60 * 60 * 1000;

export function FeedbackNudge() {
  const hydrated = useHydrated();
  const { data: notes } = useFeedback();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!hydrated) return;
    const now = Date.now();

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? '0');
    if (now - dismissedAt < COOLDOWN_DAYS * DAY_MS) {
      setDismissed(true);
      return;
    }

    // "Quiet" = no note in the last QUIET_DAYS (or never). notes is RLS-scoped
    // to the current user, newest first.
    const latest = notes?.[0]?.created_at ? new Date(notes[0].created_at).getTime() : 0;
    const quiet = now - latest > QUIET_DAYS * DAY_MS;
    setDismissed(!quiet);
  }, [hydrated, notes]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div className="fixed right-4 z-[59] max-w-[15rem] rounded-xl border border-[rgba(250,247,242,0.3)] bg-[var(--color-charcoal)] p-3 bottom-[calc(env(safe-area-inset-bottom,0px)+124px)] min-[980px]:bottom-[72px]">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 text-[rgba(250,247,242,0.4)] hover:text-[var(--color-pearl)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="pr-4 font-heading text-[13px] leading-snug text-[var(--color-pearl)]">
        Anything on your mind?
      </p>
      <p className="mt-1 text-[11px] leading-snug text-[rgba(250,247,242,0.55)]">
        What’s working, not working, missing, or would you change?
      </p>
      <button
        type="button"
        onClick={() => { dismiss(); openFeedbackSheet(); }}
        className="mt-2 rounded-md bg-[var(--color-clay)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]"
      >
        Leave a note
      </button>
    </div>
  );
}
