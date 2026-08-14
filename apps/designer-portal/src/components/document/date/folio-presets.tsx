'use client';

/**
 * FolioPresets — the three shortcuts above the grid. Each chip carries a
 * right-aligned mono annotation of the day it means ("Fri 14"), so the
 * shortcut is legible before it is taken.
 *
 * A preset never commits: it sets the DRAFT day in day mode, and the span
 * ANCHOR in span mode (the second click still has to close the window).
 * Every date comes off the injected `today` through the calendar helpers —
 * this component reads no clock.
 */

import {
  epochDayFromISO,
  isoFromEpochDay,
  nextWorkday,
  weekdayFromEpochDay,
} from '@patina/utils';
import { FOLIO_WEEKDAY_ABBR } from '@/lib/document/folio-calendar-derivation';

export interface FolioPresetsProps {
  /** Injected clock, 'YYYY-MM-DD'. */
  today: string;
  onPick: (iso: string) => void;
  minDate?: string | null;
  className?: string;
}

/** A week out from today, landed on the following Monday — the day a designer
 *  means by "next week" (never a mid-week date). */
function nextWeekStart(epoch: number): number {
  const weekOut = epoch + 7;
  const weekday = weekdayFromEpochDay(weekOut);
  return weekOut + ((1 - weekday + 7) % 7);
}

/** "Fri 14" — the annotation beside a preset's name. */
function annotate(iso: string): string {
  const epoch = epochDayFromISO(iso);
  if (epoch == null) return '';
  return `${FOLIO_WEEKDAY_ABBR[weekdayFromEpochDay(epoch)]} ${Number(iso.slice(8, 10))}`;
}

export function FolioPresets({ today, onPick, minDate, className }: FolioPresetsProps) {
  const epoch = epochDayFromISO(today);
  if (epoch == null) return null;

  const presets = [
    { key: 'today', label: 'Today', iso: today },
    { key: 'next-workday', label: 'Next workday', iso: isoFromEpochDay(nextWorkday(epoch)) },
    { key: 'next-week', label: 'Next week', iso: isoFromEpochDay(nextWeekStart(epoch)) },
  ].filter((preset): preset is { key: string; label: string; iso: string } => preset.iso != null);

  return (
    <div className={`flex gap-[7px] ${className ?? ''}`}>
      {presets.map((preset) => {
        const blocked = minDate != null && preset.iso < minDate;
        return (
          <button
            key={preset.key}
            type="button"
            data-folio-preset={preset.key}
            aria-disabled={blocked || undefined}
            onClick={() => {
              if (blocked) return;
              onPick(preset.iso);
            }}
            className={`flex flex-1 items-center justify-between gap-2 whitespace-nowrap rounded-[2px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-[9px] py-[7px] text-left text-[11.5px] text-[var(--color-mocha)] ${
              blocked
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-[var(--color-clay)] hover:text-[var(--color-charcoal)]'
            }`}
          >
            <span>{preset.label}</span>
            <span className="font-mono text-[9px] tracking-[0.06em] text-[var(--color-aged-oak)]">
              {annotate(preset.iso)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
