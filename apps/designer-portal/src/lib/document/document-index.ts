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
  // The six Project stops.
  | 'approvals'
  | 'schedule'
  | 'ffe'
  | 'money'
  | 'care'
  | 'record'
  // The pre-work stops (Wave 5, OD-2). `record` is shared: `PreviousWork`
  // mounts at the foot of EVERY spread, pre-work included.
  | 'brief'
  | 'discovery'
  | 'direction'
  | 'proposal'
  | 'scope'
  | 'vision'
  | 'investment';

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
 * The pre-work stops (OD-2/DL-02). Declared BESIDE `PROJECT_PAPER_ORDER`, never
 * inside it: that array is the Project section's own mount order, and a
 * pre-work stop never appears on it. The two together are every region the
 * paper can name.
 *
 * The heading ids take no project id — a brief, a discovery and a proposal all
 * exist before a project does, so an id keyed on one would be keyed on ''.
 */
export const PREWORK_PAPER_REGIONS: readonly ProjectPaperRegion[] = [
  {
    key: 'brief',
    label: 'The brief',
    headingId: () => 'brief-region-heading',
  },
  {
    key: 'discovery',
    label: 'Discovery',
    headingId: () => 'discovery-region-heading',
  },
  {
    key: 'direction',
    label: 'Direction',
    headingId: () => 'direction-region-heading',
  },
  {
    key: 'proposal',
    label: 'The proposal',
    headingId: () => 'proposal-region-heading',
  },
  {
    key: 'scope',
    label: 'Scope & engagement',
    headingId: () => 'scope-region-heading',
  },
  {
    key: 'vision',
    label: 'Design vision',
    headingId: () => 'vision-region-heading',
  },
  {
    key: 'investment',
    label: 'The investment',
    headingId: () => 'investment-region-heading',
  },
];

const ALL_PAPER_REGIONS: readonly ProjectPaperRegion[] = [
  ...PROJECT_PAPER_ORDER,
  ...PREWORK_PAPER_REGIONS,
];

/** The declaration for one key. Throws for the same reason `regionHeadingId`
 *  does: a key in the union with no region declared is a hole, not a default. */
export function paperRegionFor(key: DocumentIndexKey): ProjectPaperRegion {
  const region = ALL_PAPER_REGIONS.find((entry) => entry.key === key);
  if (!region) throw new Error(`no paper region declared for "${key}"`);
  return region;
}

/**
 * The regions a given spread actually puts on the paper (C11) — one table, one
 * row per section, so a spread's order is stated once and read everywhere.
 *
 * A row whose region the spread never mounts is a scroll-spy target with
 * nothing behind it, so the install and care spreads print neither Money
 * (`MoneyRegion` mounts only under `spreadSection === 'project'`,
 * page.tsx:1448) nor Schedule (`ScheduleSpine` — the only
 * `data-index-region="schedule"` root — mounts only under the same branch,
 * page.tsx:1399).
 *
 * Wave 5 (OD-2) gives the four pre-work spreads their own rows. They mount
 * their regions in page.tsx's own order rather than in `PROJECT_PAPER_ORDER`,
 * so those rows are written as key lists and resolved through
 * `paperRegionFor`; the Project subsets stay BUILT from `PROJECT_PAPER_ORDER`,
 * so a subset can never state an order the paper does not print.
 */
function regionsInPaperOrder(
  keys: readonly DocumentIndexKey[],
): readonly ProjectPaperRegion[] {
  const wanted = new Set(keys);
  return PROJECT_PAPER_ORDER.filter((region) => wanted.has(region.key));
}

function regionsInMountOrder(
  keys: readonly DocumentIndexKey[],
): readonly ProjectPaperRegion[] {
  return keys.map(paperRegionFor);
}

const SECTION_PAPER_REGIONS: Record<
  SectionKey,
  readonly ProjectPaperRegion[]
> = {
  brief: regionsInMountOrder(['brief', 'record']),
  discovery: regionsInMountOrder(['discovery', 'record']),
  direction: regionsInMountOrder(['direction', 'record']),
  proposal: regionsInMountOrder([
    'proposal',
    'scope',
    'vision',
    'investment',
    'record',
  ]),
  project: PROJECT_PAPER_ORDER,
  install: regionsInPaperOrder(['approvals', 'ffe', 'care', 'record']),
  care: regionsInPaperOrder(['approvals', 'ffe', 'care', 'record']),
};

export function paperRegionsForSection(
  section: SectionKey,
): readonly ProjectPaperRegion[] {
  return SECTION_PAPER_REGIONS[section] ?? [];
}

/** The four spreads that stand before a project does (OD-2). They carry no
 *  phase and no ordinal, so the band and the rail head both print the spread's
 *  own name and nothing under it (W5-R2 §3, W5-R4 F2). */
const PREWORK_SECTIONS: readonly SectionKey[] = [
  'brief',
  'discovery',
  'direction',
  'proposal',
];

export function isPreWorkSection(section: SectionKey | null): boolean {
  return section != null && PREWORK_SECTIONS.includes(section);
}

/** Reading order down the paper — derived, never declared twice. */
export const DOCUMENT_INDEX_KEYS: readonly DocumentIndexKey[] =
  PROJECT_PAPER_ORDER.map((region) => region.key);

/** Every key the union carries, project and pre-work alike — the rail and the
 *  paper's own head can never name a stop two ways. */
export const DOCUMENT_INDEX_LABELS: Record<DocumentIndexKey, string> =
  Object.fromEntries(
    ALL_PAPER_REGIONS.map((region) => [region.key, region.label]),
  ) as Record<DocumentIndexKey, string>;

export function regionHeadingId(
  key: DocumentIndexKey,
  projectId: string,
): string {
  // Unreachable while DocumentIndexKey is exactly the declared keys; the throw
  // is what keeps that true if a key is ever added to the union alone.
  return paperRegionFor(key).headingId(projectId);
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
