/**
 * The margin's ONE grouper — W5F-06.
 *
 * The desktop rail and the 390 sheet print the same margin, grouped the same
 * way, and they used to derive that grouping twice. The copies had already
 * drifted: the sheet dropped `kind === 'time'` before it grouped and the rail
 * did not, so a logged time entry counted toward `THE WHOLE JOB · N` on the
 * rail and not in the sheet — one margin, two numbers, which is the defect
 * W5-R5 §3 closed for raised-vs-settled and this closes for kind.
 *
 * `time` is not a margin item the margin prints: it is the studio's own clock,
 * and every surface that lists the margin excludes it. That exclusion lives
 * here now, above both callers, so a third surface cannot forget it.
 *
 * The two callers still differ in ORDER — the sheet leads with the whole job
 * (W5-R1 reverses the rail's print order, not the grouping mechanic) — and in
 * what they decorate each row with, so the grouper answers plain rows and each
 * caller wraps them.
 */

import { marginAnchorRegion, marginRegionName } from '@/components/document/margin-item';
import { PROJECT_PAPER_ORDER, type DocumentIndexKey } from './document-index';
import type { MarginItemRow } from './margin-derivation';

export interface MarginGroup<T> {
  key: DocumentIndexKey | null;
  /** `BESIDE PIECES` · `THE WHOLE JOB` — the ratified print contract. */
  heading: string;
  rows: T[];
}

/** What the margin LISTS: everything but the studio's own clock. */
export function marginListable(
  rows: readonly MarginItemRow[],
): MarginItemRow[] {
  return rows.filter((row) => row.kind !== 'time');
}

/**
 * Group already-listable rows by anchor, in the paper's own region order.
 *
 * `order: 'whole-job-first'` is the sheet's (W5-R1); `'regions-first'` is the
 * rail's. A group with no members is never printed, and `decorate` builds each
 * caller's row shape.
 *
 * W5F2-03 — this used to document an `extra` parameter ("rows that count toward
 * a group's heading without appearing in `rows`") the signature never had. The
 * rail does that split itself, over the rows this returns
 * (`margin-rail.tsx` — raised vs settled).
 */
export function groupMarginRows<T>(
  rows: readonly MarginItemRow[],
  {
    order,
    decorate,
  }: {
    order: 'whole-job-first' | 'regions-first';
    decorate: (row: MarginItemRow) => T;
  },
): MarginGroup<T>[] {
  const byKey = new Map<DocumentIndexKey | null, T[]>();
  for (const row of rows) {
    const key = marginAnchorRegion(row);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(decorate(row));
    else byKey.set(key, [decorate(row)]);
  }

  const ordered: MarginGroup<T>[] = [];
  const pushWholeJob = () => {
    const wholeJob = byKey.get(null);
    if (wholeJob?.length) {
      ordered.push({ key: null, heading: 'THE WHOLE JOB', rows: wholeJob });
    }
  };
  const pushRegions = () => {
    for (const region of PROJECT_PAPER_ORDER) {
      const regionRows = byKey.get(region.key);
      if (regionRows?.length) {
        ordered.push({
          key: region.key,
          heading: `BESIDE ${marginRegionName(region.key)}`,
          rows: regionRows,
        });
      }
    }
  };

  if (order === 'whole-job-first') {
    pushWholeJob();
    pushRegions();
  } else {
    pushRegions();
    pushWholeJob();
  }
  return ordered;
}

/** The anchor key a row groups under — re-exported so callers need one import. */
export { marginAnchorRegion };
