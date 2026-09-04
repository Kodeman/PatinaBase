'use client';

import { useEffect, useState } from 'react';

/* ── A CEILING ON THE HOLD ───────────────────────────────────────────────────
   The house holds — blank, silent — until every source it speaks from has
   answered. Silence is the rule while an answer is on its way. But a fetch
   that never resolves is not silence: it is a blank page with nothing said,
   for as long as the client is willing to look at it.

   React Query's `retry: 2` bounds a FAILING request. It does not bound a
   hanging one, which has no error to retry from. So the hold gets a clock of
   its own: past it, the house says one quiet sentence rather than nothing at
   all. It never un-says anything — the page has stated no fact yet. ──────── */

export const HOLD_CEILING_MS = 15_000;

export function useHoldCeiling(holding: boolean, ms = HOLD_CEILING_MS): boolean {
  const [reached, setReached] = useState(false);

  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(() => setReached(true), ms);
    // Re-armed on the way out rather than on the way in, so a second hold
    // (a route change, a refetch) starts its clock from zero instead of
    // reporting the moment it begins.
    return () => {
      clearTimeout(timer);
      setReached(false);
    };
  }, [holding, ms]);

  return holding && reached;
}
