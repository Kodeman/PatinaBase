'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { todayYmd } from '@/lib/document/format';
import { FolioCalendar, FolioPopover } from './date';

const pad2 = (value: number) => String(value).padStart(2, '0');

const daysInMonth = (year: number, month: number) => {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

/** Parse direct US date entry without ever round-tripping a DATE through UTC. */
export function parseDateText(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const year = Number(iso?.[1] ?? us?.[3]);
  const month = Number(iso?.[2] ?? us?.[1]);
  const day = Number(iso?.[3] ?? us?.[2]);

  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export const displayDateText = (iso: string | null) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return match ? `${match[2]}/${match[3]}/${match[1]}` : (iso ?? '');
};

export function DateTextInput({
  value,
  onChange,
  className,
  ariaLabel,
  onValidityChange,
  instruction = 'Choose a date from the calendar.',
  disabled = false,
  minDate,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
  ariaLabel?: string;
  onValidityChange?: (valid: boolean) => void;
  instruction?: string;
  disabled?: boolean;
  /** Passed through to the Folio's own `minDate` — a site that gated the old
   *  native input's `min` attribute keeps the same floor on the grid. */
  minDate?: string | null;
}) {
  const descriptionId = useId();
  const errorId = useId();
  const canonicalValue = value && parseDateText(value) === value ? value : '';
  const invalid = Boolean(value && !canonicalValue);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    onValidityChange?.(!invalid);
  }, [invalid, onValidityChange]);

  return (
    <span className="block">
      <span className="relative inline-block w-full">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={`${descriptionId}${invalid ? ` ${errorId}` : ''}`}
          aria-invalid={invalid || undefined}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={`flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ''}`}
        >
          <span>
            {canonicalValue ? (
              displayDateText(canonicalValue)
            ) : (
              <span className="font-mono italic text-[var(--text-faint)]">MM/DD/YYYY</span>
            )}
          </span>
          {canonicalValue && !disabled ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date"
              onClick={(event) => {
                event.stopPropagation();
                onValidityChange?.(true);
                onChange(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                onValidityChange?.(true);
                onChange(null);
              }}
              className="font-mono text-[10px] text-[var(--text-muted)] hover:text-[var(--color-terracotta-ink)]"
            >
              ×
            </span>
          ) : null}
        </button>
        {open && !disabled ? (
          <FolioPopover
            onClose={() => setOpen(false)}
            returnFocusRef={triggerRef}
            aria-label={ariaLabel ?? 'Choose a date'}
          >
            <FolioCalendar
              modes={['day']}
              value={canonicalValue ? { kind: 'day', date: canonicalValue } : null}
              today={todayYmd()}
              minDate={minDate}
              onCommit={(selection) => {
                if (selection.kind !== 'day') return;
                onValidityChange?.(true);
                onChange(selection.date);
                setOpen(false);
              }}
            />
          </FolioPopover>
        ) : null}
      </span>
      <span
        id={descriptionId}
        className="mt-1 block font-mono text-[8.5px] normal-case tracking-normal text-[var(--text-muted)]"
      >
        {instruction}
      </span>
      {invalid ? (
        <span
          id={errorId}
          role="alert"
          className="mt-1 block text-[10px] text-[var(--color-terracotta-ink)]"
        >
          Choose a valid calendar date.
        </span>
      ) : null}
    </span>
  );
}
