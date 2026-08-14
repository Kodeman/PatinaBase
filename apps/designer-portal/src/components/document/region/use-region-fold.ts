'use client';

/**
 * Whether a Project region is folded shut — and who gets to say so.
 *
 * Three voices, in strict order: `forceOpen` (a caller who must show the body,
 * e.g. a deep link landing inside it) outranks everything; then the designer's
 * own explicit choice, remembered per document per region; then the derived
 * default the region computes from its data.
 *
 * The default is LATCHED rather than read live. Region data settles late (a
 * query resolving after first paint), and a default that arrived after the
 * designer had already opened a region would otherwise yank it shut under her
 * hand. So once an explicit choice exists it is final, and until it does, the
 * latch only takes a default that has actually settled (`defaultFolded !== null`).
 *
 * The explicit choice is read from localStorage in an effect, never during
 * render: the server has no storage, so reading it inline would make the first
 * client render disagree with the markup React hydrated.
 */

import { useCallback, useEffect, useState } from 'react';
import { documentEvents } from '@/lib/analytics/document-events';

export type RegionFoldKey =
  | 'approvals'
  | 'schedule'
  | 'ffe'
  | 'money'
  | 'boards'
  | 'care';

const STORAGE_PREFIX = 'patina:doc-fold:';

function storageKeyFor(docId: string, region: RegionFoldKey): string {
  return `${STORAGE_PREFIX}${docId}:${region}`;
}

/** The remembered choice, or null when none has been made. SSR-safe; a blocked
 *  or disabled store reads as "no choice", so the derived default governs. */
function readExplicit(
  docId: string | null | undefined,
  region: RegionFoldKey,
): boolean | null {
  if (typeof window === 'undefined' || !docId) return null;
  try {
    const raw = window.localStorage.getItem(storageKeyFor(docId, region));
    if (raw === '1') return true;
    if (raw === '0') return false;
    return null;
  } catch {
    return null;
  }
}

function writeExplicit(
  docId: string | null | undefined,
  region: RegionFoldKey,
  folded: boolean,
): void {
  if (typeof window === 'undefined' || !docId) return;
  try {
    window.localStorage.setItem(
      storageKeyFor(docId, region),
      folded ? '1' : '0',
    );
  } catch {
    /* private mode / storage disabled — best-effort; the fold simply reverts to
       its derived default on the next visit rather than crashing the region. */
  }
}

export interface UseRegionFoldArgs {
  docId: string | null | undefined;
  region: RegionFoldKey;
  /** null = the region's data has not settled; hold whatever is current. */
  defaultFolded: boolean | null;
  /** Overrides both the choice and the default while true. */
  forceOpen?: boolean;
}

export interface RegionFold {
  folded: boolean;
  toggle: () => void;
  setFolded: (value: boolean) => void;
}

export function useRegionFold({
  docId,
  region,
  defaultFolded,
  forceOpen = false,
}: UseRegionFoldArgs): RegionFold {
  const [explicit, setExplicit] = useState<boolean | null>(null);
  const [latchedDefault, setLatchedDefault] = useState<boolean>(
    defaultFolded ?? false,
  );

  useEffect(() => {
    setExplicit(readExplicit(docId, region));
  }, [docId, region]);

  useEffect(() => {
    if (defaultFolded === null) return;
    setLatchedDefault((current) => (explicit === null ? defaultFolded : current));
  }, [defaultFolded, explicit]);

  const folded = forceOpen ? false : (explicit ?? latchedDefault);

  const setFolded = useCallback(
    (value: boolean) => {
      setExplicit(value);
      writeExplicit(docId, region, value);
      documentEvents.regionFolded({ region, folded: value });
    },
    [docId, region],
  );

  const toggle = useCallback(() => {
    setFolded(!folded);
  }, [folded, setFolded]);

  return { folded, toggle, setFolded };
}
