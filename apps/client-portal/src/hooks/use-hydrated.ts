'use client';

import { useEffect, useState } from 'react';

/**
 * False on the server and during the first client render, true from the first
 * effect onward.
 *
 * Gate anything whose value can legitimately differ between the server render
 * and the first client render — `new Date()` straddling midnight, a count that
 * only exists once TanStack Query has resolved. Render the *same* placeholder
 * on both sides of hydration and swap to the live value after; the alternative
 * is a hydration mismatch that React resolves by silently discarding the
 * server HTML.
 *
 * The Making's standing sentence is the reason this exists in the client
 * portal: it reads today's date and three query-derived counts, none of which
 * are knowable at first paint.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
