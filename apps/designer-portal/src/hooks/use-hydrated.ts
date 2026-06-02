'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `false` during SSR and on the very first client render, then `true`
 * after the mount effect fires.
 *
 * Why this exists: the app shares a single module-level TanStack QueryClient
 * (`src/lib/react-query.ts`). On the server the query cache is always empty, so
 * data hooks report `isLoading` and pages render `<LoadingStrata/>`. After a
 * client-side navigation the singleton cache is already warm, so the first
 * client render produces the LOADED tree instead — a server/client divergence
 * that triggers "Hydration failed…" and shifts React's `useId` counter
 * (the Radix `aria-controls` mismatch in the top-bar dropdown).
 *
 * Gating a loading skeleton on `!hydrated || isLoading` forces the server and
 * the first client paint to render the same skeleton, then swaps to real
 * content on the next render once hydration is complete.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
