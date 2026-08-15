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

export type DocumentIndexKey = 'schedule' | 'approvals' | 'ffe' | 'money';

/** Reading order down the paper. */
export const DOCUMENT_INDEX_KEYS: readonly DocumentIndexKey[] = [
  'schedule',
  'approvals',
  'ffe',
  'money',
];

export const DOCUMENT_INDEX_LABELS: Record<DocumentIndexKey, string> = {
  schedule: 'Schedule',
  approvals: 'Client approvals',
  ffe: 'Project · FF&E',
  money: 'Design authority',
};

export function regionHeadingId(
  key: DocumentIndexKey,
  projectId: string,
): string {
  switch (key) {
    case 'schedule':
      return 'project-schedule-title';
    case 'approvals':
      return 'project-approvals-title';
    case 'ffe':
      return `ffe-region-heading-${projectId}`;
    case 'money':
      return 'money-region-heading';
  }
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
