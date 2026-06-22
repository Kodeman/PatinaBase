/**
 * Section anchor ids — one source of truth for the DOM ids the spine, the
 * settled bars, the active section, and the mobile spine sheet all address when
 * a phase is clicked. Keeps the spine's jump targets and the section wrappers
 * from drifting apart (mirrors the existing `doc-room-${id}` convention used by
 * the mobile room jumps in mobile-sheets.tsx).
 */

import type { SectionKey } from './desk-derivation';

export function sectionAnchorId(key: SectionKey): string {
  return `doc-section-${key}`;
}
