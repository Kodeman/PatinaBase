'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** One thing that holds an act, as the spotlight shows it (US-36 K1). */
export type SpotlightHold = {
  id: string;
  /** Re-read on every sync: a target that stops resolving has been fixed. */
  target: () => HTMLElement | null;
  label: string;
  reason: string;
  fix?: ReactNode;
};

/**
 * The seam every held act adopts (K3: pressing the held act is the only
 * trigger). `open(fromEl)` records the act that opened it; focus goes back
 * there however the spotlight closes. Spread `props` onto `<HoldSpotlight>`
 * along with its `frame`.
 */
export function useHoldSpotlight(holds: SpotlightHold[]) {
  const [isOpen, setIsOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const open = useCallback((fromEl?: HTMLElement | null) => {
    opener.current =
      fromEl ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  // A passive effect, so it runs after HoldSpotlight's layout cleanup has
  // lifted the `inert` it laid over the opener.
  useEffect(() => {
    if (isOpen) return;
    const el = opener.current;
    opener.current = null;
    if (el?.isConnected) el.focus({ preventScroll: true });
  }, [isOpen]);

  return { open, close, props: { holds, open: isOpen, onClose: close } };
}
