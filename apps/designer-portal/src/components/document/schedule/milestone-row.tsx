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
  /** Compose (Slice 03): when the milestone is anchored, its chip becomes a
   *  one-click unpin (clears anchor_date). Omitted → the chip is inert text,
   *  byte-identical to the read-only Slice 01 markup. */
  onUnpinAnchor?: () => void;
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

export function MilestoneRow({ milestone, today, highlighted = false, onUnpinAnchor }: MilestoneRowProps) {
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
      {milestone.anchored && <AnchorChip date={milestone.date} className="flex-none" onUnpin={onUnpinAnchor} />}
      <span
        className="ml-auto whitespace-nowrap pl-3 font-mono text-[11px] uppercase tracking-[0.06em]"
        style={{ color: stamp.late ? 'var(--color-terracotta-ink)' : 'var(--color-aged-oak)' }}
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
 *
 * Compose (Slice 03): pass `onUnpin` and the chip becomes a real <button> —
 * one click clears anchor_date (R100 "one click unpins"). Omitted → an inert
 * <span>, byte-identical to the read-only Slice 01 markup.
 */
const chipCls =
  'inline-block whitespace-nowrap rounded-[2px] border border-[var(--color-charcoal)] px-[0.45rem] py-[0.15rem] font-mono text-[11px] font-medium uppercase leading-none tracking-[0.08em] text-[var(--color-charcoal)]';

export function AnchorChip({
  date,
  className = '',
  onUnpin,
}: {
  date: string | null;
  className?: string;
  onUnpin?: () => void;
}) {
  const label = date ? `Anchored · ${fmtDay(date)}` : 'Anchored';
  if (onUnpin) {
    return (
      <button
        type="button"
        onClick={onUnpin}
        title="Unpin — clear this anchor"
        aria-label={`Unpin anchor${date ? ` (${fmtDay(date)})` : ''}`}
        className={`${chipCls} cursor-pointer hover:opacity-80 ${className}`}
      >
        {label}
      </button>
    );
  }
  return <span className={`${chipCls} ${className}`}>{label}</span>;
}
