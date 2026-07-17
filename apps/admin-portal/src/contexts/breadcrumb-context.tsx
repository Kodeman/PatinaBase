'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// Lets a deep page override the LAST breadcrumb segment's label (R3.6, C1
// fix). useActiveZone's breadcrumb builder derives every OTHER segment from
// the URL alone, but a raw route param (e.g. an order UUID) is meaningless on
// screen — the Order Workbench swaps in "Order #{orderNo} · {clientName}"
// once its data loads. Deliberately scoped to only the last crumb: no page
// needs to override the zone crumb or any middle segment today.

interface BreadcrumbContextValue {
  lastLabel: string | null;
  setLastLabel: (label: string | null) => void;
}

export const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [lastLabel, setLastLabelState] = useState<string | null>(null);
  // Stable identity across renders — see useBreadcrumbLastLabel's dependency
  // on it below (an unstable setter would re-fire that effect every render).
  const setLastLabel = useCallback((label: string | null) => setLastLabelState(label), []);
  const value = useMemo(() => ({ lastLabel, setLastLabel }), [lastLabel, setLastLabel]);

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/**
 * Called from a deep page to override the breadcrumb's last segment while
 * mounted. Pass `null` (e.g. before data has loaded) to leave the default
 * URL-derived label in place. Always clears the override on unmount so a
 * stale label never survives navigating to a different deep page.
 */
export function useBreadcrumbLastLabel(label: string | null): void {
  const ctx = useContext(BreadcrumbContext);
  const setLastLabel = ctx?.setLastLabel;

  useEffect(() => {
    setLastLabel?.(label);
    return () => setLastLabel?.(null);
  }, [setLastLabel, label]);
}
