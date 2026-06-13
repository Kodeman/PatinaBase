/**
 * Strata Mark fill-state — ruling R15 (static part; the breath is Slice 6).
 *
 * The mark's three lines answer "how far": line 1 fills through SHAPING
 * (Brief→Direction), line 2 at COMMITMENT (proposal signed), line 3 through
 * DELIVERY (Project→Install→Care). Fractions: settled sections count full,
 * the active section counts half (derivation detail — DECISIONS I14).
 * Spine section markers keep their per-section colors ("which section").
 */

import type { DocumentStateRow, SectionKey } from './desk-derivation';
import type { SpineSection } from './section-derivation';

export type FillState = [number, number, number];

const SHAPING: SectionKey[] = ['brief', 'discovery', 'direction'];
const DELIVERY: SectionKey[] = ['project', 'install', 'care'];

function groupFraction(sections: SpineSection[], keys: SectionKey[]): number {
  let credit = 0;
  for (const key of keys) {
    const s = sections.find((x) => x.key === key);
    if (!s) continue;
    if (s.state === 'settled') credit += 1;
    else if (s.state === 'active') credit += 0.5;
  }
  return Math.min(1, credit / keys.length);
}

/** Fill-state from full section derivation (letterhead, spine-adjacent uses). */
export function deriveFillState(sections: SpineSection[]): FillState {
  const proposal = sections.find((s) => s.key === 'proposal');
  const commitment = proposal?.state === 'settled' ? 1 : proposal?.state === 'active' ? 0.5 : 0;
  return [groupFraction(sections, SHAPING), commitment, groupFraction(sections, DELIVERY)];
}

const ORDER: SectionKey[] = [
  'brief',
  'discovery',
  'direction',
  'proposal',
  'project',
  'install',
  'care',
];

/**
 * Desk approximation (folder tabs, ⌘K rows): lineage-blind — everything
 * before the active section counts settled. Manual projects therefore
 * overstate SHAPING/COMMITMENT on the Desk (flagged in DECISIONS I14).
 */
export function fillStateForDesk(row: DocumentStateRow): FillState {
  const activeIdx = ORDER.indexOf(row.active_section);
  const sections: SpineSection[] = ORDER.map((key, idx) => ({
    key,
    label: key,
    state: idx < activeIdx ? 'settled' : idx === activeIdx ? 'active' : 'future',
    sub: '',
  }));
  return deriveFillState(sections);
}

/**
 * R35 — the spine's per-marker fill: the engagement's fill AS OF a given
 * section, so the seven markers read as a filling staircase (the HTML's
 * "watch it fill"). Sections before `key` count settled, `key` active, after
 * future; the caller breathes only the active marker.
 */
export function fillStateAtSection(key: SectionKey): FillState {
  const idx = ORDER.indexOf(key);
  const snapshot: SpineSection[] = ORDER.map((k, i) => ({
    key: k,
    label: k,
    state: i < idx ? 'settled' : i === idx ? 'active' : 'future',
    sub: '',
  }));
  return deriveFillState(snapshot);
}
