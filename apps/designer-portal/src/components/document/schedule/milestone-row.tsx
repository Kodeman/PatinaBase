'use client';

/**
 * Milestone row — one diamond line inside a phase entry (C6, Slice 01 read).
 * Prototype: `.mb-mile` / `.dia` / `.r` + `.anchor-chip` in
 * the-document-schedule-master-direction.html.
 *
 * The diamond carries the status (signed sage · due golden with a terracotta
 * ring · upcoming hollow · slipped terracotta); the right-aligned DM Mono
 * stamp carries the copy from `milestoneStamp` — terracotta ink when late.
 * Anchored milestones wear the charcoal anchor chip (a pinned date holds its
 * ground). A null date is degenerate, never a crash — the stamp renders a
 * dash. Pure presentational; zero shadows (D4) — the due ring is a real CSS
 * outline, exactly the slide's device, never a box-shadow.
 */

import type { CSSProperties } from 'react';
import type { MilestoneStatus, ResolvedMilestone } from '@patina/utils';
import { milestoneStamp } from '@/lib/document/schedule-spine-derivation';
import { fmtDay } from '@/lib/document/format';

export interface MilestoneRowProps {
  /** The resolver's milestone, augmented with its display name. */
  milestone: ResolvedMilestone & { name: string };
  /** 'YYYY-MM-DD' — for the stamp's overdue arithmetic. */
  today: string;
  /** Transiently flashed by a Rule minimap reveal (~1.6s). A clay-tint band +
   *  name underline — NEVER a shadow (D4). Default false → the row renders
   *  byte-identically to the pre-reveal Slice 01 markup. */
  highlighted?: boolean;
}

/** The diamond per derived status (`.dia.signed/.due/.ahead` + slipped). */
const DIAMOND: Record<MilestoneStatus, CSSProperties> = {
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

export function MilestoneRow({ milestone, today, highlighted = false }: MilestoneRowProps) {
  const stamp = milestoneStamp(milestone, today);
  return (
    <div
      className={`flex items-center gap-[0.7rem] py-[0.42rem] text-[0.8rem] text-[var(--color-mocha)]${
        highlighted
          ? ' -mx-2 rounded-[3px] bg-[rgba(196,165,123,0.14)] px-2 transition-colors'
          : ''
      }`}
    >
      <span
        aria-hidden
        className="h-[7px] w-[7px] flex-none rotate-45"
        style={DIAMOND[milestone.derivedStatus]}
      />
      <span
        className={`min-w-0 truncate${
          highlighted ? ' underline decoration-[var(--color-clay)] underline-offset-2' : ''
        }`}
      >
        {milestone.name}
      </span>
      {milestone.anchored && <AnchorChip date={milestone.date} className="flex-none" />}
      <span
        className="ml-auto whitespace-nowrap pl-3 font-mono text-[0.58rem] uppercase tracking-[0.06em]"
        style={{ color: stamp.late ? 'var(--color-terracotta)' : 'var(--color-aged-oak)' }}
      >
        {stamp.text}
      </span>
    </div>
  );
}

/**
 * The anchor chip (`.anchor-chip`) — the charcoal mark an anchored phase or
 * milestone wears: `Anchored · {fmt(date)}`. Hosted here so the phase heading
 * and the milestone row share one mark without an import cycle.
 */
export function AnchorChip({
  date,
  className = '',
}: {
  date: string | null;
  className?: string;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-[2px] border border-[var(--color-charcoal)] px-[0.45rem] py-[0.15rem] font-mono text-[0.56rem] font-medium uppercase leading-none tracking-[0.08em] text-[var(--color-charcoal)] ${className}`}
    >
      {date ? `Anchored · ${fmtDay(date)}` : 'Anchored'}
    </span>
  );
}
