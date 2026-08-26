/**
 * The running index — the four Project regions that carry a real inline
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

export type DocumentIndexKey = 'schedule' | 'approvals' | 'ffe' | 'money';

export interface ProjectPaperRegion {
  key: DocumentIndexKey;
  label: string;
  headingId: (projectId: string) => string;
}

/**
 * THE canonical order — the Project section's regions in the order the paper
 * mounts them in `app/(document)/doc/[id]/page.tsx`: the approvals record
 * (mounted under the letterhead), the Rule, the FF&E schedule, the money
 * region. Everything the running index states about order is read from here,
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
    label: 'Project · FF&E',
    headingId: (projectId) => `ffe-region-heading-${projectId}`,
  },
  {
    key: 'money',
    label: 'Design authority',
    headingId: () => 'money-region-heading',
  },
];

/**
 * The regions a given spread actually puts on the paper (C11). A row whose
 * region the spread never mounts is a scroll-spy target with nothing behind it,
 * so the install and care spreads print neither Money (`MoneyRegion` mounts
 * only under `spreadSection === 'project'`, page.tsx:1448) nor Schedule
 * (`ScheduleSpine` — the only `data-index-region="schedule"` root — mounts only
 * under the same branch, page.tsx:1399). The four stages before the work starts
 * put no Project region on the paper at all.
 *
 * Derived by filtering `PROJECT_PAPER_ORDER`, so a subset can never state an
 * order the paper does not print.
 */
const WORK_SPREAD_REGIONS: readonly ProjectPaperRegion[] =
  PROJECT_PAPER_ORDER.filter(
    (region) => region.key !== 'money' && region.key !== 'schedule',
  );

export function paperRegionsForSection(
  section: SectionKey,
): readonly ProjectPaperRegion[] {
  if (section === 'project') return PROJECT_PAPER_ORDER;
  if (section === 'install' || section === 'care') return WORK_SPREAD_REGIONS;
  return [];
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
