'use client';

/**
 * Rule diamond — one milestone stamp on the line (C6 · R99, Slice 02).
 * Prototype: `.ma-di.signed/.due/.ahead` in
 * the-document-schedule-master-direction.html; pinned size from `.pin-rule .dd`.
 *
 * The diamond is a MINIMAP control, not decoration: a real focusable
 * `<button>` (aria-labelled with the milestone name) that reveals the
 * milestone's phase in the spine, its row transiently highlighted (§3.5).
 * It is the ONLY interactivity — no drag, no slide (Slice 04). Stamp palette
 * matches the spine's milestone row exactly: signed sage · due golden with a
 * terracotta ring · upcoming hollow aged-oak · slipped terracotta. `pinned`
 * shrinks 8px → 6px per the prototype's `.dd`. The ring is a real CSS outline
 * (never a box-shadow — D4).
 */

import type { CSSProperties } from 'react';
import type { MilestoneStatus } from '@patina/utils';

export interface RuleDiamondProps {
  xPct: number;
  status: MilestoneStatus;
  /** The milestone's display name — the button's accessible label. */
  label: string;
  pinned: boolean;
  onClick: () => void;
}

/** The stamp face per derived status (`.ma-di` + the spine row's slipped). */
const FACE: Record<MilestoneStatus, CSSProperties> = {
  signed: { background: 'var(--color-sage)' },
  due: {
    background: 'var(--color-golden-hour)',
    outline: '1.5px solid var(--color-terracotta)',
    outlineOffset: '1px',
  },
  upcoming: {
    background: 'var(--color-off-white)',
    border: '1.5px solid var(--color-aged-oak)',
  },
  slipped: { background: 'var(--color-terracotta)' },
};

export function RuleDiamond({ xPct, status, label, pinned, onClick }: RuleDiamondProps) {
  const size = pinned ? 6 : 8;
  const top = pinned ? 8.5 : 65;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} — reveal in the schedule`}
      className="absolute rotate-45 cursor-pointer p-0"
      style={{
        left: `${xPct}%`,
        top,
        width: size,
        height: size,
        marginLeft: -(size / 2),
        ...FACE[status],
      }}
    />
  );
}
