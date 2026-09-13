'use client';

/**
 * The controls every capture surface carries (W3 · HT-11 · HT-12 · HT-41).
 *
 * One definition, four surfaces — the ⌘K "Log time" form, the Hours add row,
 * the log-offer strip, and the phone's manual sheet. They were four different
 * answers to the same question before: the desk auto-timer sent the fail-closed
 * intent, a hand-typed entry sent nothing (and was defaulted `true`), and Field
 * sent nothing at all. Same project, three answers.
 *
 *  · BillablePill — the explicit control, seeded from the RESOLVED answer
 *    (`automaticTimeBillingIntent`, fail-closed), never from optimism, and
 *    printing the reason beside itself (HT-12: "non-billable · no agreement").
 *  · RateRoleChip — HT-41's pick, rendered ONLY where the member holds more
 *    than one live roster role on that document. One role is not a choice.
 *  · RateReadout — what the hour is worth and where the answer came from, as a
 *    sentence. Never a blank: "rate pending" is a fact (HT-26).
 *
 * Nothing here adds a REQUIRED tap: the pill and the chip arrive already
 * answered (§0.22 — the zero-tap in-document path stays zero).
 */

import { useMemo } from 'react';
import { useMyRateRoles, type TimeRateRole, type TimeRateSource } from '@patina/supabase';
import { useProjectBillingAuthority } from '@/hooks/use-commercial-documents';
import {
  automaticTimeBillingIntent,
  billableIntentSentence,
  timeRateProvenance,
  timeRateRoleLabel,
  type BillableIntentReason,
} from '@/lib/document/authority-hours';
import { fmtUsd } from '@/lib/document/format';
import { DocumentAction } from './document-action';

/**
 * What a failed authority read says. NOT "no agreement" — that is a fact about
 * the document, and a read that never answered has learned no facts (W3-R4-m17).
 */
export const BILLABLE_INTENT_UNREADABLE = 'agreement not read · state it yourself';

/**
 * The server's fail-closed answer for one document, as a pill can seed itself
 * from it. `isSettled` false means the authority read has not answered — it is
 * still in flight, or it failed — so the pill must not print a reason it does
 * not have and the act must not write an answer that does not exist yet.
 */
export function useBillableIntent(projectId: string | null): {
  billable: boolean;
  reason: BillableIntentReason;
  sentence: string;
  isSettled: boolean;
  /** The read failed. Not an answer, and not "no agreement" either. */
  unreadable: boolean;
} {
  const authority = useProjectBillingAuthority(projectId ?? '', Boolean(projectId));
  return useMemo(() => {
    const intent = automaticTimeBillingIntent(authority.data);
    const unreadable = Boolean(projectId) && Boolean(authority.isError);
    return {
      billable: intent.billable,
      reason: intent.reason,
      sentence: unreadable
        ? BILLABLE_INTENT_UNREADABLE
        : billableIntentSentence(intent.reason),
      isSettled:
        Boolean(projectId) && !authority.isLoading && !authority.isError,
      unreadable,
    };
  }, [authority.data, authority.isError, authority.isLoading, projectId]);
}

/**
 * HT-11 — billable, said out loud, at every capture surface. `aria-pressed`
 * carries the state so the word itself never has to change to report it (the
 * lens's own grammar, R150).
 */
export function BillablePill({
  value,
  onChange,
  reason,
  disabled,
  surfaceKey,
  regionKey,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  /** The resolved reason, printed beside the control (HT-12). */
  reason?: string | null;
  disabled?: boolean;
  surfaceKey: string;
  regionKey: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <DocumentAction
        actionKey="set-time-entry-billable"
        surfaceKey={surfaceKey}
        regionKey={regionKey}
        variant="tertiary"
        aria-pressed={value}
        aria-label={value ? 'Billable — press to make non-billable' : 'Non-billable — press to make billable'}
        disabled={disabled}
        onClick={() => onChange(!value)}
      >
        {value ? 'Billable' : 'Non-billable'}
      </DocumentAction>
      {reason ? (
        <span className="min-w-0 truncate t-head text-[var(--color-aged-oak)]">
          {reason}
        </span>
      ) : null}
    </span>
  );
}

/**
 * HT-41 — which of her roles priced this hour. Rendered only when the member
 * holds more than one live roster role that a rate card can price; with one
 * role the server derives it and a control here would be a tap that decides
 * nothing.
 */
export function RateRoleChip({
  projectId,
  value,
  onChange,
  disabled,
}: {
  projectId: string | null;
  value: TimeRateRole | null;
  onChange: (next: TimeRateRole | null) => void;
  disabled?: boolean;
}) {
  const { data: roles } = useMyRateRoles(projectId);
  if (!roles || roles.length < 2) return null;

  return (
    <label className="inline-flex min-h-11 items-center gap-2">
      <span className="t-head text-[var(--color-aged-oak)]">As</span>
      <select
        aria-label="Which role priced this hour"
        disabled={disabled}
        className="min-h-11 rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 t-body-sm text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-40 [&_option]:bg-[var(--doc-paper)]"
        value={value ?? ''}
        onChange={(e) =>
          onChange((e.target.value || null) as TimeRateRole | null)
        }
      >
        <option value="">role…</option>
        {roles.map((role) => (
          <option key={role} value={role}>
            {timeRateRoleLabel(role)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * HT-41, read-only. On a surface where the hour is ALREADY WRITTEN — the
 * log-offer strip — the role is not a choice: `rate_role` is caller-suppliable
 * on INSERT and immutable afterwards (00600's guard raises for every
 * non-postgres caller). So the strip states which of her roles priced it, and
 * only where she holds more than one; a picker there would offer an edit the
 * server refuses.
 */
export function RateRoleMark({
  projectId,
  role,
}: {
  projectId: string | null;
  role: TimeRateRole | null;
}) {
  const { data: roles } = useMyRateRoles(projectId);
  if (!role || !roles || roles.length < 2) return null;
  return (
    <span className="t-head text-[var(--color-aged-oak)]">
      as {timeRateRoleLabel(role)}
    </span>
  );
}

/**
 * HT-26 — what the hour is worth and where that came from. Never a blank:
 * "rate pending" is a fact, an empty cell is three facts wearing one face.
 * The ROLE is deliberately absent here — `RateRoleMark` owns it, so it prints
 * only where the member holds more than one (HT-41) instead of on every row.
 */
export function RateReadout({
  entry,
  className,
}: {
  entry: {
    hourly_rate_cents?: number | null;
    rate_source?: TimeRateSource | null;
    rate_role?: TimeRateRole | null;
    billable?: boolean | null;
    rated_amount_cents?: number | null;
  };
  className?: string;
}) {
  const provenance = timeRateProvenance(entry, null);
  const amount = entry.rated_amount_cents ?? 0;

  return (
    <span className={`t-head text-[var(--color-aged-oak)] ${className ?? ''}`}>
      {[
        provenance.kind === 'rated'
          ? `${provenance.label} · ${fmtUsd(provenance.hourlyRateCents)}/hr`
          : provenance.label,
        // A money figure is never printed beside its own negation. The log
        // strip passes the LIVE pill state as `billable` and the STORED
        // `rated_amount_cents` as the amount, so one tap on the pill after a
        // billable, priced hour used to render "not billable · $150.00" — the
        // server zeroes the amount only once the row is written (00601:309).
        provenance.kind === 'nonbillable'
          ? null
          : amount > 0
            ? fmtUsd(amount)
            : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  );
}

/**
 * HT-13 — the quiet mark on an hour remembered late. Derived from the two
 * timestamps the row already carries (no column, no migration): an entry whose
 * `created_at - started_at` exceeds 30 days was written about a day well past.
 * A word, in the row's own ink — never a badge and never a colour (HT-40, §6).
 */
export const BACKDATE_MARK_DAYS = 30;

export function isBackdatedEntry(entry: {
  started_at?: string | null;
  created_at?: string | null;
}): boolean {
  if (!entry.started_at || !entry.created_at) return false;
  const started = new Date(entry.started_at).getTime();
  const created = new Date(entry.created_at).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(created)) return false;
  return created - started > BACKDATE_MARK_DAYS * 86_400_000;
}

/** The local-calendar `yyyy-mm-dd` a `<input type="date">` reads and writes. */
export function isoDateValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Is this a day the member actually named? A cleared `<input type="date">`
 * reads `''`, and `startedAtFromDateValue('')` falls back to NOW — so without
 * this guard an emptied field files the hour under today while the field on
 * screen is blank and nothing is said. Every capture surface that carries a
 * date gates its act on this, so the act simply stands unavailable instead
 * (W3-R3-M2).
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export function isDayValue(value: string): boolean {
  return ISO_DAY.test(value);
}

/**
 * A `yyyy-mm-dd` from a date field, as the instant to store. The clock is kept
 * from `now` so an hour logged for today still lands at the hour it was
 * logged; a backdated one lands at the same time of day on the day named.
 */
export function startedAtFromDateValue(
  value: string,
  now: Date = new Date(),
): string {
  const [y, m, d] = value.split('-').map((n) => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return now.toISOString();
  }
  const at = new Date(now);
  at.setFullYear(y, m - 1, d);
  return at.toISOString();
}
