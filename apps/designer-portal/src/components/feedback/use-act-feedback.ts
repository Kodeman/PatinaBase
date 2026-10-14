'use client';

/**
 * US-34 N12a — the feedback grammar's clock for one act (plan §5.1, D2 §2).
 *
 *   pressed        S0: pressed, nothing started yet (cleared after B1).
 *   pending-quiet  S1: under way, under 400 ms. The act's own answer (the new
 *                  value, or the verb in progress) is the only signal.
 *   pending-word   S2: past 400 ms, `saving…` shows. Once shown it holds at
 *                  least 500 ms, through the settle, so it never blinks.
 *   slow           past 8 s: the act adds its "Still working." line.
 *   settled        S3: the write answered. Show the server's truth; nothing
 *                  celebrates.
 *   failed         S4: the write failed. The act shows its own alert.
 *
 * It reads only `status`, so a TanStack mutation result fits as is, and a
 * hand-rolled async act (act-draft) passes `{ status }`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ANSWER_BUDGET_MS,
  PENDING_WORD_DELAY_MS,
  PENDING_WORD_HOLD_MS,
  STILL_WORKING_WRITE_MS,
} from '@/lib/loading/thresholds';

export type ActPhase =
  | 'idle'
  | 'pressed'
  | 'pending-quiet'
  | 'pending-word'
  | 'slow'
  | 'settled'
  | 'failed';

export interface ActLike {
  status: 'idle' | 'pending' | 'success' | 'error';
}

export function useActFeedback(mutation: ActLike): { phase: ActPhase; press: () => void } {
  const { status } = mutation;
  const [word, setWord] = useState<'none' | 'word' | 'slow'>('none');
  const [holding, setHolding] = useState(false);
  const [pressed, setPressed] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The clock runs per pending spell, from the moment it starts.
  useEffect(() => {
    if (status !== 'pending') return;
    setPressed(false);
    const toWord = setTimeout(() => {
      setWord('word');
      setHolding(true);
      clearTimeout(holdTimer.current);
      holdTimer.current = setTimeout(() => setHolding(false), PENDING_WORD_HOLD_MS);
    }, PENDING_WORD_DELAY_MS);
    const toSlow = setTimeout(() => setWord('slow'), STILL_WORKING_WRITE_MS);
    return () => {
      clearTimeout(toWord);
      clearTimeout(toSlow);
    };
  }, [status]);

  // Settled and past the hold: the next spell starts quiet.
  useEffect(() => {
    if (status !== 'pending' && !holding) setWord('none');
  }, [status, holding]);

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  useEffect(() => {
    if (!pressed) return;
    const t = setTimeout(() => setPressed(false), ANSWER_BUDGET_MS);
    return () => clearTimeout(t);
  }, [pressed]);

  const press = useCallback(() => setPressed(true), []);

  let phase: ActPhase;
  if (status === 'pending' || holding) {
    phase = word === 'slow' ? 'slow' : word === 'word' ? 'pending-word' : 'pending-quiet';
  } else if (status === 'success') phase = 'settled';
  else if (status === 'error') phase = 'failed';
  else phase = pressed ? 'pressed' : 'idle';

  return { phase, press };
}

/** S2 and later: the `saving…` word (or the act's own verb) is showing. */
export const isWordShowing = (phase: ActPhase): boolean =>
  phase === 'pending-word' || phase === 'slow';
