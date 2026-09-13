'use client';

/**
 * One member's studio rate, and the dated rows behind it (HT-3).
 *
 * The rate is tier 2 of the one chain a signed agreement rate heads: the server
 * resolves it when the hour is priced, so nothing here ever writes a rate onto
 * a time entry. Saving on blur is this page's write-through idiom (no Save
 * button), and a correction is a NEW dated row — 00598 is append-only, with no
 * DELETE policy, because a rate a studio billed an hour against is a fact.
 *
 * Extracted so the Account · Studio page grows by a mount rather than by the
 * field, the history and the error line three times over.
 */

import { useState } from 'react';
import {
  useSetStudioMemberRate,
  type StudioMemberRate,
} from '@patina/supabase';

const FIELD =
  'w-[9rem] border-0 border-b border-[var(--color-pearl)] bg-transparent py-1.5 text-[13px] text-[var(--color-charcoal)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] disabled:opacity-50';
const META =
  'font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]';

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** Returns null for an empty or unparseable field, and for anything ≤ 0 — the
 *  00598 CHECK refuses a non-positive rate, so a cleared field is "no answer",
 *  never "this person's hour is worth nothing". */
function rateInputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const amount = Number(trimmed.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export function StudioRateRows({
  studioId,
  userId,
  memberLabel,
  rates,
}: {
  studioId: string;
  userId: string;
  memberLabel: string;
  /** Every row this caller may read for this member, newest first. */
  rates: StudioMemberRate[];
}) {
  const setRate = useSetStudioMemberRate();
  const history = rates
    .filter((row) => row.user_id === userId)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  const open = history.find((row) => row.effective_to === null) ?? history[0];
  const [error, setError] = useState<string | null>(null);

  const save = (value: string) => {
    setError(null);
    const cents = rateInputToCents(value);
    if (cents === null) {
      if (value.trim() !== '') setError('Enter an hourly rate above zero.');
      return;
    }
    if (open && cents === open.hourly_rate_cents) return;
    setRate.mutate(
      { studioId, userId, hourlyRateCents: cents },
      {
        onError: (err) =>
          setError(
            err instanceof Error ? err.message : 'Could not save that rate.',
          ),
      },
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-baseline gap-2">
        <span className="sr-only">{`Hourly rate for ${memberLabel}`}</span>
        <span className={META}>$</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Hourly rate for ${memberLabel}`}
          placeholder="Not set"
          className={FIELD}
          disabled={setRate.isPending}
          defaultValue={open ? dollars(open.hourly_rate_cents) : ''}
          onBlur={(event) => save(event.target.value)}
        />
        <span className={META}>/hr</span>
      </label>

      {error && (
        <p
          role="alert"
          className="text-[11px] text-[var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}

      {history.length > 0 && (
        <ul>
          {history.map((row) => (
            <li key={row.id} className={META}>
              ${dollars(row.hourly_rate_cents)} · from{' '}
              {fmtDate(row.effective_from)}
              {row.effective_to ? ` to ${fmtDate(row.effective_to)}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
