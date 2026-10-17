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
 *
 * The field is CONTROLLED and always shows the rate actually in force: an
 * emptied blur writes nothing (00598's CHECK refuses a non-positive rate and
 * there is no DELETE policy, so the last dated rate stands) and a refused save
 * changes nothing, and in both cases a field left holding what was typed
 * contradicted the dated history directly beneath it with nothing saying which
 * figure was real.
 *
 * HT-3-e(2) (00615) — a row whose `created_by` IS its own `user_id` prices an
 * hour ONLY where that person is the studio's owner. So for an admin reading her
 * OWN row this field would save, show its dated row, and change nothing about
 * what her hours are worth. `selfAuthoredInert` says that out loud instead of
 * taking the keystroke: the history still reads, the field is gone.
 */

import { useEffect, useRef, useState } from 'react';
import {
  useRerateRatePendingHours,
  useSetStudioMemberRate,
  type StudioMemberRate,
} from '@patina/supabase';
import { DocumentAction } from '../document-action';
import { ActFailLine } from '@/components/feedback/act-fail-line';

const FIELD =
  'w-[9rem] border-0 border-b border-[var(--color-pearl)] bg-transparent py-1.5 t-body-sm text-[var(--color-charcoal)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] disabled:opacity-50';
const META =
  't-head text-[var(--color-aged-oak)]';

const dollars = (cents: number) => (cents / 100).toFixed(2);
/** K8 counts hours, never entries: to one decimal, with no trailing `.0`. */
const hoursOf = (minutes: number) => String(Math.round(minutes / 6) / 10);

/** K8 — 00797 refuses in its own words behind its function's name, and the
 *  superseded refusal carries the row's id. Say the words without either;
 *  any other failure (a lapsed session, the network) is ActFailLine's. */
const RERATE_REFUSALS: Array<[RegExp, string]> = [
  [/the rate changed since you saved it/, 'The rate changed since you saved it; save it again to price these hours.'],
  [/has been superseded/, 'This rate has been superseded and is not this member’s current rate.'],
  [/a rate members set for themselves/, 'A rate members set for themselves prices their hours only in a studio they own.'],
  [/only an owner or admin of the studio/, 'Only an owner or admin of the studio may price its pending hours.'],
];
function rerateRefusal(error: unknown): unknown {
  const message =
    error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (!message.startsWith('rerate_pending_time_entries:')) return error;
  return new Error(
    RERATE_REFUSALS.find(([pattern]) => pattern.test(message))?.[1] ??
      'These hours could not be priced at this rate.',
  );
}

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
  selfAuthoredInert = false,
  pendingMinutes = 0,
  focusOnMount = false,
}: {
  studioId: string;
  userId: string;
  memberLabel: string;
  /** Every row this caller may read for this member, newest first. */
  rates: StudioMemberRate[];
  /** HT-3-e(2) — this is the acting user's own row and she is not the studio's
   *  owner, so anything she writes here would not price her hours. */
  selfAuthoredInert?: boolean;
  /** K8 — this member's rate-pending, never-invoiced minutes in this studio. */
  pendingMinutes?: number;
  /** The composer's "Set <name>'s rate" landed here. */
  focusOnMount?: boolean;
}) {
  const setRate = useSetStudioMemberRate();
  const rerate = useRerateRatePendingHours();
  const fieldRef = useRef<HTMLInputElement>(null);
  // K8 — the row the last save on this field wrote. The offer prices at that
  // row and no other, so it never appears for a rate already in force.
  const [saved, setSaved] = useState<StudioMemberRate | null>(null);
  const [priced, setPriced] = useState<{ rateId: string; count: number } | null>(
    null,
  );
  // The save rides the field's blur, so focus has already moved on: when the
  // save raises the offer, its act takes focus; otherwise focus stays put.
  const priceRef = useRef<HTMLButtonElement>(null);
  const offerFor = saved && pendingMinutes > 0 ? saved.id : null;
  useEffect(() => {
    if (offerFor) priceRef.current?.focus();
  }, [offerFor]);
  useEffect(() => {
    if (!focusOnMount) return;
    // Two frames: the sheet lands its own focus the frame after it opens, and
    // a cached roster mounts this row in that same commit.
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => fieldRef.current?.focus());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusOnMount]);
  const history = rates
    .filter((row) => row.user_id === userId)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  const open = history.find((row) => row.effective_to === null) ?? history[0];
  const inForce = open ? dollars(open.hourly_rate_cents) : '';
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(inForce);
  // A saved rate arrives as a new dated row, so the field follows the fact
  // rather than holding the keystroke that produced it.
  const [seenInForce, setSeenInForce] = useState(inForce);
  if (inForce !== seenInForce) {
    setSeenInForce(inForce);
    setDraft(inForce);
  }

  const save = (value: string) => {
    setError(null);
    const cents = rateInputToCents(value);
    if (cents === null) {
      // Cleared: no answer, so the rate in force stands — and says so.
      if (value.trim() === '') setDraft(inForce);
      else setError('Enter an hourly rate above zero.');
      return;
    }
    if (open && cents === open.hourly_rate_cents) return;
    setRate.mutate(
      { studioId, userId, hourlyRateCents: cents },
      {
        onSuccess: (row) => {
          rerate.reset();
          setPriced(null);
          setSaved(row);
        },
        onError: (err) => {
          setError(
            err instanceof Error ? err.message : 'Could not save that rate.',
          );
          setDraft(inForce);
        },
      },
    );
  };

  if (selfAuthoredInert) {
    return (
      <div className="flex flex-col gap-1">
        <p className="max-w-[38ch] text-right t-body-sm text-[var(--color-aged-oak)]">
          {open === undefined
            ? 'No rate yet.'
            : // `created_by` NULL is a deleted author, not self-authorship
              // (00615) — such a row prices, so it is not called out here.
              open.created_by === userId
              ? `$${dollars(open.hourly_rate_cents)}/hr, written by you — which is why your hours still read “rate pending”.`
              : `$${dollars(open.hourly_rate_cents)}/hr, written for you by the studio.`}{' '}
          A rate you write for yourself does not price your own hours; the
          studio&rsquo;s owner, or another admin, has to write it.
        </p>
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

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-baseline gap-2">
        <span className="sr-only">{`Hourly rate for ${memberLabel}`}</span>
        <span className={META}>$</span>
        <input
          ref={fieldRef}
          type="text"
          inputMode="decimal"
          aria-label={`Hourly rate for ${memberLabel}`}
          placeholder="Not set"
          className={FIELD}
          disabled={setRate.isPending}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => save(event.target.value)}
        />
        <span className={META}>/hr</span>
      </label>

      {error && (
        <p
          role="alert"
          className="t-body-sm text-[var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}

      {/* K8 — pricing the hours logged before this rate is her act, never
          the save's. */}
      {saved && pendingMinutes > 0 && priced?.rateId !== saved.id && (
        <div className="flex max-w-[38ch] flex-wrap items-baseline justify-end gap-x-3 text-right">
          <p className="t-body-sm text-[var(--color-charcoal)]">
            {`${hoursOf(pendingMinutes)} hours were logged before this rate. Price them at $${dollars(saved.hourly_rate_cents)}/hr?`}
          </p>
          <DocumentAction
            ref={priceRef}
            actionKey="price-rate-pending-hours"
            surfaceKey="account"
            regionKey="studio-rates"
            variant="tertiary"
            loading={rerate.isPending}
            loadingLabel="Pricing…"
            onClick={() => {
              const rateId = saved.id;
              // The server's count, not the estimate shown: hours can move
              // between the read and the act.
              rerate.mutate(
                { rateId, expectedRateCents: saved.hourly_rate_cents },
                { onSuccess: (count) => setPriced({ rateId, count }) },
              );
            }}
          >
            Price them
          </DocumentAction>
        </div>
      )}
      <ActFailLine error={rerate.error && rerateRefusal(rerate.error)} />
      <p role="status" className={META}>
        {priced
          ? priced.count > 0
            ? 'Priced the hours logged before this rate.'
            : 'No hours were waiting for this rate.'
          : ''}
      </p>

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
