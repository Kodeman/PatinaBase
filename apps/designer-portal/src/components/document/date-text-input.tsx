'use client';

import { useEffect, useId, useState } from 'react';

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
  instruction = 'Enter as MM/DD/YYYY.',
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
  ariaLabel?: string;
  onValidityChange?: (valid: boolean) => void;
  instruction?: string;
}) {
  const descriptionId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(() => displayDateText(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(displayDateText(value));
    setInvalid(false);
    onValidityChange?.(!value || parseDateText(value) !== null);
  }, [value, onValidityChange]);

  const commit = () => {
    if (!draft.trim()) {
      setInvalid(false);
      onValidityChange?.(true);
      onChange(null);
      return true;
    }
    const parsed = parseDateText(draft);
    if (!parsed) {
      setInvalid(true);
      onValidityChange?.(false);
      return false;
    }
    setInvalid(false);
    onValidityChange?.(true);
    setDraft(displayDateText(parsed));
    onChange(parsed);
    return true;
  };

  return (
    <span className="block">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="MM/DD/YYYY"
        value={draft}
        aria-label={ariaLabel}
        aria-describedby={`${descriptionId}${invalid ? ` ${errorId}` : ''}`}
        aria-invalid={invalid || undefined}
        className={className}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          setInvalid(false);
          onValidityChange?.(!next.trim() || parseDateText(next) !== null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !commit()) event.preventDefault();
        }}
      />
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
          className="mt-1 block text-[10px] text-[var(--color-terracotta)]"
        >
          Use a valid date in MM/DD/YYYY format.
        </span>
      ) : null}
    </span>
  );
}
