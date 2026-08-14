'use client';

/**
 * FolioCalendar — the Calendar Folio itself. Works inline or inside a
 * FolioPopover; it is the same instrument either way.
 *
 * Presets → mode toggle → month header → grid → readout + SET. Nothing here
 * commits until SET: every click builds a DRAFT, and `onCommit` fires once,
 * from the SET press alone. All date reasoning lives in
 * `@/lib/document/folio-calendar-derivation` and `@patina/utils`; the clock is
 * injected as `today` (this component never reads one).
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { addMonths, monthOf } from '@patina/utils';
import {
  FOLIO_MONTH_NAME,
  folioClickDay,
  folioCommittable,
  folioDraftFromValue,
  folioReadout,
  folioReadoutLabel,
  folioShadeRange,
  type FolioDraft,
  type FolioReadoutLabels,
  type FolioSelection,
} from '@/lib/document/folio-calendar-derivation';
import { FolioMonthGrid } from './folio-month-grid';
import { FolioPresets } from './folio-presets';

export type { FolioSelection };

export interface FolioCalendarProps {
  /** The committed value; it paints the grid and seeds the draft. */
  value: FolioSelection | null;
  /** Injected clock, 'YYYY-MM-DD'. */
  today: string;
  /** Which shapes this surface accepts; a single mode hides the toggle. */
  modes?: Array<'day' | 'span'>;
  minDate?: string | null;
  readoutLabels?: FolioReadoutLabels;
  /** Adoption hook beside the readout (e.g. "Place it in the schedule"). */
  footerExtra?: ReactNode;
  /** Fires ONLY on SET. */
  onCommit: (selection: FolioSelection) => void;
  /**
   * Esc inside the instrument — INLINE usage only. Inside a FolioPopover the
   * popover consumes Esc in the capture phase (it has to, to keep DocSheet and
   * the confirm strip from acting on the same key), so a popover caller wires
   * its dismissal to `FolioPopover.onClose`, not here.
   */
  onCancel?: () => void;
  /** Defaults to true — the popover case is the common one. Inline callers
   *  that must not steal the caret pass false. */
  autoFocus?: boolean;
  className?: string;
}

const DEFAULT_LABELS: FolioReadoutLabels = { day: 'DUE', span: 'WORKING WINDOW' };

const MODE_LABELS: Record<'day' | 'span', string> = {
  day: 'On a day',
  span: 'Over a span',
};

/** The day a draft is "about" — where the month view and the caret open. */
function draftFocus(draft: FolioDraft): string | null {
  return draft.mode === 'day' ? draft.date : draft.anchor;
}

/** A stable identity for what the draft was seeded FROM — the committed value
 *  and the shapes the surface offers, since a modes change re-derives it. */
function seedKey(value: FolioSelection | null, modesKey: string): string {
  const shape = value == null ? '' : value.kind === 'day' ? `day:${value.date}` : `span:${value.start}:${value.end}`;
  return `${modesKey}#${shape}`;
}

export function FolioCalendar({
  value,
  today,
  modes = ['day', 'span'],
  minDate,
  readoutLabels = DEFAULT_LABELS,
  footerExtra,
  onCommit,
  onCancel,
  autoFocus = true,
  className,
}: FolioCalendarProps) {
  const fallbackMode = modes[0] ?? 'day';
  const modesKey = modes.join('|');
  const [draft, setDraft] = useState<FolioDraft>(() =>
    folioDraftFromValue(value, fallbackMode, modes),
  );
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const [focusIso, setFocusIso] = useState<string>(
    () => draftFocus(folioDraftFromValue(value, fallbackMode, modes)) ?? today,
  );
  const [view, setView] = useState(() => monthOf(focusIso) ?? monthOf(today) ?? { year: 1970, month: 1 });

  const seededFrom = useRef(seedKey(value, modesKey));
  useEffect(() => {
    const key = seedKey(value, modesKey);
    if (key === seededFrom.current) return;
    seededFrom.current = key;
    const next = folioDraftFromValue(value, fallbackMode, modesKey.split('|') as Array<'day' | 'span'>);
    setDraft(next);
    setHoverIso(null);
    const focus = draftFocus(next);
    if (focus != null) {
      setFocusIso(focus);
      const month = monthOf(focus);
      if (month != null) setView(month);
    }
  }, [value, fallbackMode, modesKey]);

  // R102 — the span preview is not a hover-only affordance: the pointer leads
  // while it is over the grid, and the roving caret leads when it isn't, so an
  // arrow-key user draws (and hears) the same live window a mouse draws.
  const previewIso = hoverIso ?? focusIso;
  const shade = folioShadeRange(draft, previewIso);
  const selectedIsos =
    draft.mode === 'day'
      ? draft.date == null
        ? []
        : [draft.date]
      : [draft.anchor, draft.end].filter((iso): iso is string => iso != null);

  const committable = folioCommittable(draft);
  const label = folioReadoutLabel(draft, readoutLabels);
  const readout = folioReadout(draft, previewIso, readoutLabels);
  // The footer typesets the label in mono and the date in Playfair, but the
  // announced sentence must be the one string the derivation produced — so the
  // parts are sliced off that string rather than re-derived here.
  const readoutValue = readout.startsWith(label) ? readout.slice(label.length).trim() : readout;

  const goToDay = (iso: string) => {
    setFocusIso(iso);
    const month = monthOf(iso);
    if (month != null) setView(month);
  };

  const pickPreset = (iso: string) => {
    setDraft((current) =>
      current.mode === 'day'
        ? { mode: 'day', date: iso }
        : { mode: 'span', anchor: iso, end: null },
    );
    setHoverIso(null);
    goToDay(iso);
  };

  const switchMode = (mode: 'day' | 'span') => {
    setHoverIso(null);
    setDraft((current) => {
      if (current.mode === mode) return current;
      return mode === 'span'
        ? { mode: 'span', anchor: current.mode === 'day' ? current.date : null, end: null }
        : { mode: 'day', date: current.mode === 'span' ? current.anchor : null };
    });
  };

  const stepView = (delta: number) => setView((current) => addMonths(current.year, current.month, delta));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onCancel?.();
  };

  const monthName = FOLIO_MONTH_NAME[view.month - 1] ?? '';

  return (
    <div
      onKeyDown={handleKeyDown}
      className={`w-[466px] max-w-full p-4 pb-[14px] ${className ?? ''}`}
    >
      <FolioPresets today={today} onPick={pickPreset} minDate={minDate} className="mb-[14px]" />

      {modes.length > 1 && (
        <div
          role="group"
          aria-label="Date shape"
          className="mb-[14px] inline-flex overflow-hidden rounded-[2px] border border-[var(--color-pearl)]"
        >
          {modes.map((mode) => {
            const on = draft.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={on}
                onClick={() => switchMode(mode)}
                className={`border-l border-[var(--color-pearl)] px-[11px] py-[6px] font-mono text-[9px] uppercase tracking-[0.13em] first:border-l-0 ${
                  on
                    ? 'bg-[var(--color-charcoal)] text-[var(--doc-paper)]'
                    : 'bg-[var(--doc-paper)] text-[var(--color-aged-oak)]'
                }`}
              >
                {MODE_LABELS[mode]}
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-[9px] flex items-center justify-between">
        <div className="flex items-baseline">
          <span className="font-[family-name:var(--font-display)] text-[19px] text-[var(--color-charcoal)]">
            {monthName}
          </span>
          <span className="ml-[7px] font-mono text-[9.5px] tracking-[0.14em] text-[var(--color-aged-oak)]">
            {view.year}
          </span>
        </div>
        <div className="flex gap-[5px]">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => stepView(-1)}
            className="flex h-[23px] w-[23px] items-center justify-center rounded-[2px] border border-[var(--color-pearl)] text-[var(--color-mocha)] hover:border-[var(--color-clay)]"
          >
            <svg viewBox="0 0 8 8" aria-hidden="true" className="h-[7px] w-[7px]">
              <path d="M6 1 2.5 4 6 7" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => stepView(1)}
            className="flex h-[23px] w-[23px] items-center justify-center rounded-[2px] border border-[var(--color-pearl)] text-[var(--color-mocha)] hover:border-[var(--color-clay)]"
          >
            <svg viewBox="0 0 8 8" aria-hidden="true" className="h-[7px] w-[7px]">
              <path d="M2.5 1 6 4 2.5 7" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>
      </div>

      <FolioMonthGrid
        year={view.year}
        month={view.month}
        today={today}
        focusIso={focusIso}
        selectedIsos={selectedIsos}
        shade={shade}
        minDate={minDate}
        autoFocus={autoFocus}
        aria-label={`${monthName} ${view.year}`}
        onFocusIsoChange={(iso) => {
          setFocusIso(iso);
          const month = monthOf(iso);
          if (month != null && (month.year !== view.year || month.month !== view.month)) {
            setView(month);
          }
        }}
        onHoverIso={setHoverIso}
        onSelect={(iso) => {
          setDraft((current) => folioClickDay(current, iso));
          setHoverIso(null);
          setFocusIso(iso);
        }}
      />

      <div className="mt-[14px] flex items-end justify-between gap-[14px] border-t border-[var(--color-pearl)] pt-[13px]">
        <div>
          <p aria-live="polite" className="leading-tight">
            {/* The trailing space is load-bearing, not stray: it keeps the
                aria-live region's text content one readable sentence rather
                than "WORKING WINDOWAug 14". */}
            <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)]">
              {`${label} `}
            </span>
            <span className="block font-[family-name:var(--font-display)] text-[17px] text-[var(--color-charcoal)]">
              {readoutValue}
            </span>
          </p>
          {footerExtra}
        </div>
        <button
          type="button"
          disabled={committable == null}
          onClick={() => {
            if (committable != null) onCommit(committable);
          }}
          className="inline-flex shrink-0 items-center gap-2 rounded-[2px] bg-[var(--color-charcoal)] px-[13px] py-[8px] font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--doc-paper)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {/* The loaded fonts carry no ✓ — the check is drawn, not typed. */}
          <svg viewBox="0 0 12 10" aria-hidden="true" className="h-[9px] w-[11px]">
            <path
              d="M1 5.4 4.3 8.6 11 1.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="square"
            />
          </svg>
          <span>Set</span>
        </button>
      </div>
    </div>
  );
}
