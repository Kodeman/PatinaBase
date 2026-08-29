/**
 * The running index — the six Project regions that carry a real inline
 * surface, and the DOM ids they already answer to.
 *
 * `sectionAnchorId` names only the seven top-level sections; the regions
 * INSIDE 'project' grew their own ad-hoc heading ids long before this index
 * existed, and `focusRegionHeading` is wired to those exact strings. So this is
 * a lookup, not a scheme: nothing is renamed.
 *
 * Region roots additionally carry `data-index-region` because a folded region
 * unmounts its body — heading and seam swap places, but the root does not move,
 * so the scrollspy has something stable to observe.
 */

import type { SectionKey } from './desk-derivation';

export type DocumentIndexKey =
  | 'approvals'
  | 'schedule'
  | 'ffe'
  | 'money'
  | 'care'
  | 'record';

export interface ProjectPaperRegion {
  key: DocumentIndexKey;
  label: string;
  headingId: (projectId: string) => string;
}

/**
 * THE canonical order — the Project section's regions in the order the paper
 * mounts them in `app/(document)/doc/[id]/page.tsx`: the approvals record
 * (mounted under the letterhead), the Rule, the FF&E schedule, the money
 * region, the closeout band, the record of previous work. Everything the
 * running index states about order is read from here,
 * so the index cannot say one order while the DOM prints another (it did:
 * the list declared schedule first while approvals mounted above it).
 *
 * Reorder a mount in page.tsx and this array moves with it, or the index lies
 * again — that pairing is the whole point of the single declaration.
 */
export const PROJECT_PAPER_ORDER: readonly ProjectPaperRegion[] = [
  {
    key: 'approvals',
    label: 'Client approvals',
    headingId: () => 'project-approvals-title',
  },
  {
    key: 'schedule',
    label: 'Schedule',
    headingId: () => 'project-schedule-title',
  },
  {
    key: 'ffe',
    label: 'Pieces',
    headingId: (projectId) => `ffe-region-heading-${projectId}`,
  },
  {
    key: 'money',
    label: 'Money',
    headingId: () => 'money-region-heading',
  },
  {
    key: 'care',
    label: 'Closing the book',
    headingId: () => 'care-region-heading',
  },
  {
    key: 'record',
    label: 'The record',
    headingId: () => 'previous-work-heading',
  },
];

/**
 * The regions a given spread actually puts on the paper (C11) — one table, one
 * row per section, so a spread's order is stated once and read everywhere.
 *
 * A row whose region the spread never mounts is a scroll-spy target with
 * nothing behind it, so the install and care spreads print neither Money
 * (`MoneyRegion` mounts only under `spreadSection === 'project'`,
 * page.tsx:1448) nor Schedule (`ScheduleSpine` — the only
 * `data-index-region="schedule"` root — mounts only under the same branch,
 * page.tsx:1399). The four stages before the work starts put no Project region
 * on the paper at all; Wave 5 gives them their own rows.
 *
 * Each row is BUILT from `PROJECT_PAPER_ORDER` rather than written out, so a
 * subset can never state an order the paper does not print.
 */
function regionsInPaperOrder(
  keys: readonly DocumentIndexKey[],
): readonly ProjectPaperRegion[] {
  const wanted = new Set(keys);
  return PROJECT_PAPER_ORDER.filter((region) => wanted.has(region.key));
}

const SECTION_PAPER_REGIONS: Record<
  SectionKey,
  readonly ProjectPaperRegion[]
> = {
  brief: [],
  discovery: [],
  direction: [],
  proposal: [],
  project: PROJECT_PAPER_ORDER,
  install: regionsInPaperOrder(['approvals', 'ffe', 'care', 'record']),
  care: regionsInPaperOrder(['approvals', 'ffe', 'care', 'record']),
};

export function paperRegionsForSection(
  section: SectionKey,
): readonly ProjectPaperRegion[] {
  return SECTION_PAPER_REGIONS[section] ?? [];
}

/** Reading order down the paper — derived, never declared twice. */
export const DOCUMENT_INDEX_KEYS: readonly DocumentIndexKey[] =
  PROJECT_PAPER_ORDER.map((region) => region.key);

export const DOCUMENT_INDEX_LABELS: Record<DocumentIndexKey, string> =
  Object.fromEntries(
    PROJECT_PAPER_ORDER.map((region) => [region.key, region.label]),
  ) as Record<DocumentIndexKey, string>;

export function regionHeadingId(
  key: DocumentIndexKey,
  projectId: string,
): string {
  const region = PROJECT_PAPER_ORDER.find((entry) => entry.key === key);
  // Unreachable while DocumentIndexKey is exactly the array's keys; the throw
  // is what keeps that true if a key is ever added to the union alone.
  if (!region) throw new Error(`no paper region declared for "${key}"`);
  return region.headingId(projectId);
}

export function regionAnchorSelector(key: DocumentIndexKey): string {
  return `[data-index-region="${key}"]`;
}

/**
 * The index cannot unfold a region directly — fold state is per-region-local
 * (`useRegionFold` is called inside each one). It asks, the region answers;
 * mirrors the `document:open-section` wire the mobile spine sheet already uses.
 */
export const UNFOLD_REGION_EVENT = 'document:unfold-region';

export function requestRegionUnfold(key: DocumentIndexKey): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(UNFOLD_REGION_EVENT, { detail: { region: key } }),
  );
}
