'use client';

/**
 * FolioMonthGrid — the month itself, as a WAI-ARIA grid.
 *
 * Roving tabindex: exactly ONE cell is tabbable, and the arrow keys move it.
 * Every navigation key is stopped here (`stopPropagation`) — a Folio opens
 * inside task rows that save on Enter and sheets that page on PageUp, and a
 * date being picked must not reach them.
 *
 * Day math comes from `@patina/utils` (epoch days), never from `Date`.
 */

import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import {
  addMonths,
  epochDayFromISO,
  isoFromEpochDay,
  monthGrid,
  monthOf,
  weekdayFromEpochDay,
} from '@patina/utils';

const WEEKDAY_HEADS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface FolioMonthGridProps {
  /** The month on view. `month` is 1-indexed. */
  year: number;
  month: number;
  /** Injected clock, 'YYYY-MM-DD' — the underlined day. */
  today: string;
  /** The day that owns tabIndex=0. May sit in an adjacent month. */
  focusIso: string;
  /** Dark-ink days: the draft day, or a span's anchor and end. */
  selectedIsos: string[];
  /** Inclusive wash range — a closed span or the live hover preview. */
  shade: { start: string; end: string } | null;
  minDate?: string | null;
  /** Keyboard roving; may land outside the month on view (the caller pages). */
  onFocusIsoChange: (iso: string) => void;
  onSelect: (iso: string) => void;
  onHoverIso: (iso: string | null) => void;
  autoFocus?: boolean;
  'aria-label'?: string;
}

/** Same day-of-month `delta` months away, clamped to that month's last day. */
function stepMonth(iso: string, delta: number): string {
  const info = monthOf(iso);
  if (info == null) return iso;
  const target = addMonths(info.year, info.month, delta);
  const days = monthGrid(target.year, target.month)
    .weeks.flat()
    .filter((cell) => cell.inMonth);
  const wanted = Number(iso.slice(8, 10));
  const exact = days.find((cell) => Number(cell.iso.slice(8, 10)) === wanted);
  return (exact ?? days[days.length - 1]).iso;
}

export function FolioMonthGrid({
  year,
  month,
  today,
  focusIso,
  selectedIsos,
  shade,
  minDate,
  onFocusIsoChange,
  onSelect,
  onHoverIso,
  autoFocus = false,
  'aria-label': ariaLabel,
}: FolioMonthGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const pullFocus = useRef(autoFocus);

  const grid = monthGrid(year, month);
  const cells = grid.weeks.flat();
  // The roving owner must exist among the 42 rendered days; when the caller's
  // focusIso is off-view (a preset in another month, mid-page), the month's
  // first day takes the tabstop so the grid is never untabbable.
  const rovingIso = cells.some((cell) => cell.iso === focusIso)
    ? focusIso
    : (cells.find((cell) => cell.inMonth) ?? cells[0]).iso;

  useEffect(() => {
    if (!pullFocus.current) return;
    pullFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>('button[data-folio-cell][tabindex="0"]')
      ?.focus();
  });

  const blocked = (iso: string) => minDate != null && iso < minDate;

  const moveFocus = (iso: string) => {
    pullFocus.current = true;
    onFocusIsoChange(iso);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const epoch = epochDayFromISO(rovingIso);
    if (epoch == null) return;

    const step = (days: number) => {
      const next = isoFromEpochDay(epoch + days);
      if (next != null) moveFocus(next);
    };

    switch (event.key) {
      case 'ArrowLeft':
        step(-1);
        break;
      case 'ArrowRight':
        step(1);
        break;
      case 'ArrowUp':
        step(-7);
        break;
      case 'ArrowDown':
        step(7);
        break;
      case 'Home':
        step(-weekdayFromEpochDay(epoch));
        break;
      case 'End':
        step(6 - weekdayFromEpochDay(epoch));
        break;
      case 'PageUp':
        moveFocus(stepMonth(rovingIso, -1));
        break;
      case 'PageDown':
        moveFocus(stepMonth(rovingIso, 1));
        break;
      case 'Enter':
      case ' ':
        if (!blocked(rovingIso)) onSelect(rovingIso);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      onPointerLeave={() => onHoverIso(null)}
    >
      <div role="row" className="grid grid-cols-7">
        {WEEKDAY_HEADS.map((name) => (
          <span
            key={name}
            role="columnheader"
            aria-label={name}
            className="pb-2 pt-[5px] text-center font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]"
          >
            {name.slice(0, 1)}
          </span>
        ))}
      </div>

      {grid.weeks.map((week) => (
        <div key={week[0].iso} role="row" className="grid grid-cols-7">
          {week.map((cell) => {
            const endpoint = selectedIsos.includes(cell.iso);
            const inSpan =
              shade != null && cell.iso >= shade.start && cell.iso <= shade.end;
            // A span's interior belongs to the selection as much as its ends —
            // a screen reader must not hear a four-day window as two days.
            const selected = endpoint || inSpan;
            const isToday = cell.iso === today;
            const unavailable = blocked(cell.iso);

            return (
              <button
                key={cell.iso}
                type="button"
                role="gridcell"
                data-folio-cell={cell.iso}
                data-in-span={inSpan || undefined}
                aria-selected={selected}
                aria-disabled={unavailable || undefined}
                aria-current={isToday ? 'date' : undefined}
                tabIndex={cell.iso === rovingIso ? 0 : -1}
                onFocus={() => {
                  if (cell.iso !== focusIso) onFocusIsoChange(cell.iso);
                }}
                onPointerEnter={() => onHoverIso(cell.iso)}
                onClick={() => {
                  if (unavailable) return;
                  onSelect(cell.iso);
                }}
                className={[
                  'relative flex h-[33px] items-center justify-center rounded-[2px] text-[12px] outline-none focus-visible:border focus-visible:border-[var(--color-clay)]',
                  endpoint
                    ? 'bg-[var(--color-charcoal)] text-[var(--doc-paper)]'
                    : inSpan
                      ? 'bg-[rgba(196,165,123,0.28)] text-[var(--color-charcoal)]'
                      : cell.inMonth
                        ? 'text-[var(--color-charcoal)]'
                        : 'text-[var(--text-muted)] opacity-60',
                  isToday && !endpoint
                    ? 'underline decoration-[var(--color-clay)] decoration-2 underline-offset-[3px]'
                    : '',
                  unavailable ? 'cursor-not-allowed opacity-40' : '',
                ].join(' ')}
              >
                {Number(cell.iso.slice(8, 10))}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
