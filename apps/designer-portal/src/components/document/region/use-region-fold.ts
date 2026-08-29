'use client';

/**
 * Whether a Project region is folded shut — and, since R127, how much of it is
 * printed when it is not. Two answers, four voices.
 *
 * The voices, in strict order: `forceOpen` (a caller who must show the body,
 * e.g. a deep link landing inside it) outranks everything; then the designer's
 * own explicit choice, remembered per document per region; then POSITION (the
 * lens: where the reader actually is on the paper, W4); then the derived
 * default the region computes from its data.
 *
 * R127 splits those two answers by key. On a STOP key — a region with a
 * `[data-index-region]` root, one of the paper's named stops — a derived
 * default no longer FOLDS the region: it opens it `quiet`, printing head,
 * count line and one leader. Only the designer can shut a stop. The three
 * remaining keys (`schedule-rule`, `money-table`, `boards`) have no root for
 * the lens to observe, so they keep I136's derived-default fold — an editor
 * that opens itself on every visit is a claim that dates need adjusting — and
 * their density is always `full`.
 *
 * OD-10: nothing migrates. An `patina:doc-fold:<docId>:<region>` key written
 * before R127 is still read the same way, so a designer who had explicitly
 * folded (say) Money arrives to find Money still folded, with `CLOSED BY YOU`
 * on its seam. What she does NOT inherit is a fold she never chose: the keys
 * that only ever held a derived default were never written, and a stop that
 * would have folded itself now arrives quiet instead.
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
  // The ledger (ScheduleSpine, inside the Project section) and the drafting
  // strip (ScheduleRule, top of the paper) are BOTH mounted on a project
  // document and fold independently — so they cannot share one storage key.
  | 'schedule'
  | 'schedule-rule'
  | 'ffe'
  | 'money'
  // The money region wears two postures on one document: its own region on the
  // section grammar's paper, and the Delivery table's reference seam (W4b).
  // They must not share a remembered choice — a designer who opened the region
  // off the flag would otherwise land on the table with the seam already spent.
  | 'money-table'
  | 'boards'
  | 'care';

/** The keys that own a `[data-index-region]` root — the paper's named stops.
 *  These are the keys where a derived default becomes density, not a fold. */
export const STOP_FOLD_KEYS = [
  'approvals',
  'schedule',
  'ffe',
  'money',
  'care',
] as const;

/** How much of an unfolded region is printed. `quiet` is head + count line +
 *  one leader; `full` is the region itself. Never a third value: a passed
 *  region looks exactly like a full one (OD-13). */
export type RegionDensity = 'full' | 'quiet';

function isStopKey(region: RegionFoldKey): boolean {
  return (STOP_FOLD_KEYS as readonly string[]).includes(region);
}

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
  /** The lens's reading of where the reader is (W4). The lowest voice, and the
   *  only one that is never remembered: it moves a stop between `quiet` and
   *  `full` and can never fold anything, so scrolling can neither shut a region
   *  nor leave a record the designer did not make. null = the lens is silent. */
  positionDensity?: RegionDensity | null;
}

export interface RegionFold {
  folded: boolean;
  density: RegionDensity;
  /** Printed on the seam. A region only ever stands folded because someone
   *  said so, so the cause is the choice — a derived default prints nothing. */
  cause: 'CLOSED BY YOU' | null;
  toggle: () => void;
  setFolded: (value: boolean) => void;
}

export function useRegionFold({
  docId,
  region,
  defaultFolded,
  forceOpen = false,
  positionDensity = null,
}: UseRegionFoldArgs): RegionFold {
  const [explicit, setExplicit] = useState<boolean | null>(null);
  const [latchedDefault, setLatchedDefault] = useState<boolean | null>(
    defaultFolded,
  );

  // A new document (or region) is a new fold question: the latched default has
  // to be released alongside the explicit choice, or the next document opens
  // wearing the last one's derived answer until its own default settles.
  useEffect(() => {
    setExplicit(readExplicit(docId, region));
    setLatchedDefault(null);
  }, [docId, region]);

  useEffect(() => {
    if (defaultFolded === null) return;
    setLatchedDefault((current) => (explicit === null ? defaultFolded : current));
  }, [defaultFolded, explicit]);

  const stop = isStopKey(region);

  const folded = forceOpen
    ? false
    : stop
      ? (explicit ?? false)
      : (explicit ?? latchedDefault ?? false);

  let density: RegionDensity = 'full';
  if (stop && !forceOpen && explicit === null) {
    // The derived default that used to fold this stop now only quiets it; the
    // lens may then say otherwise, and nothing it says is written down.
    density = positionDensity ?? (latchedDefault === true ? 'quiet' : 'full');
  }

  const cause = explicit === true ? ('CLOSED BY YOU' as const) : null;

  const setFolded = useCallback(
    (value: boolean) => {
      // While a caller is forcing the body open, folding is a gesture with no
      // visible effect — so it must leave no record either. Remembering it
      // would fold the region shut the moment forceOpen lapses, on a document
      // the designer never saw fold.
      if (forceOpen && value) return;
      setExplicit(value);
      writeExplicit(docId, region, value);
      documentEvents.regionFolded({ region, folded: value });
    },
    [docId, region, forceOpen],
  );

  const toggle = useCallback(() => {
    setFolded(!folded);
  }, [folded, setFolded]);

  return { folded, density, cause, toggle, setFolded };
}
