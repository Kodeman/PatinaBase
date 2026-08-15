'use client';

/**
 * The glance — the compact single-track read of the schedule: the status-
 * weighted line, its boundary ticks, the today cut, and (optionally) the month
 * letters beneath it. Purely presentational: it draws a resolution it is
 * handed and owns no data, no scale, and no scroll behaviour.
 *
 * Two surfaces render it. The PINNED glance (the sticky fold that appears once
 * the drafting strip has scrolled past) passes its interactive layers —
 * diamonds, boundary handles, ghosts — as children, into the same positioned
 * coordinate space the track uses. The FOLDED schedule region renders it alone,
 * with the month letters, as the whole of what a folded schedule says in
 * pictures.
 */

import type { ReactNode, RefObject } from 'react';
import type {
  RuleMonthColumn,
  RuleSegment,
} from '@/lib/document/schedule-rule-derivation';
import { RuleTrack } from './rule-track';
import { RuleToday } from './rule-today';

/** The prototype's `.pin-rule` fold height — the one reserved band. */
export const GLANCE_BAND_H = 22;

export interface ScheduleGlanceStripProps {
  segments: RuleSegment[];
  todayXPct: number | null;
  today: string;
  /** The month letters beneath the line. Omitted by the pinned fold, which has
   *  the project's own title beside it instead. */
  months?: RuleMonthColumn[];
  /** The % coordinate space a drag reads its pointer x against. */
  trackRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  children?: ReactNode;
}

export function ScheduleGlanceStrip({
  segments,
  todayXPct,
  today,
  months,
  trackRef,
  className,
  children,
}: ScheduleGlanceStripProps) {
  return (
    <div className={className}>
      <div
        ref={trackRef}
        className="relative w-full"
        style={{ height: GLANCE_BAND_H }}
      >
        <RuleTrack segments={segments} pinned todayXPct={todayXPct} />
        {todayXPct != null && (
          <RuleToday xPct={todayXPct} today={today} pinned />
        )}
        {children}
      </div>
      {months && months.length > 0 && (
        <div aria-hidden className="relative mt-1 h-3">
          {months.map((m) => (
            <span
              key={m.key}
              className="absolute top-0 font-mono text-[0.56rem] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]"
              style={{ left: `${m.xPct}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
