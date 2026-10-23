'use client';

import { useProcurementClaimDeadline } from '@patina/supabase';
import { WEEKDAY_SHORT_FORMAT, dayMonth, parseSourceDate } from '@/lib/document/dates';
import { todayYmd } from '@/lib/document/format';

export interface ClaimClock {
  sentence: string;
  /** The vendor deadline is behind us: the sentence prints in golden ink. */
  passed: boolean;
}

/** "72 hours" up to three days (how vendors state it), "5 days" past that. */
function windowWords(days: number): string {
  if (days <= 3) return `${days * 24} hours`;
  return `${days} days`;
}

/** NULL window days mean unknown, independently of whether delivery is recorded. */
export function claimClockSentence({
  vendorName,
  deadline,
  windowDays,
  today = todayYmd(),
}: {
  vendorName: string;
  deadline: string | null | undefined;
  windowDays: number | null;
  /** Local `YYYY-MM-DD`; injectable for tests. */
  today?: string;
}): ClaimClock | null {
  if (windowDays == null) {
    return { sentence: 'Notice window unknown — add vendor terms', passed: false };
  }
  const date = parseSourceDate(deadline ?? null);
  if (!deadline || !date) return null;
  const day = `${WEEKDAY_SHORT_FORMAT.format(date)} ${dayMonth(date)}`;
  const why = `(${windowWords(windowDays)} from delivery, per the ${vendorName} account)`;
  const passed = deadline.slice(0, 10) < today;
  return passed
    ? {
        sentence: `${vendorName}'s window closed ${day} ${why} — you can still file.`,
        passed,
      }
    : { sentence: `${vendorName} wants written notice by ${day} ${why}.`, passed };
}

/** The RPC's nullable term is authoritative; no second account read or inferred default. */
export function ClaimClockLine({
  purchaseOrderId,
  vendorName,
  vendorId,
  className = '',
}: {
  purchaseOrderId: string | null | undefined;
  vendorId: string | null | undefined;
  vendorName: string;
  className?: string;
}) {
  const { data: clock } = useProcurementClaimDeadline(purchaseOrderId);
  if (!clock) return null;
  const line = claimClockSentence({
    vendorName,
    deadline: clock.vendor_deadline,
    windowDays: clock.claims_window_days,
  });
  if (!line) return null;
  return (
    <div
      data-testid="claim-clock"
      data-passed={line.passed ? 'true' : undefined}
      className={`${className} ${
        line.passed
          ? 'text-[var(--color-golden-hour-ink)]'
          : 'text-[var(--color-charcoal)]'
      }`}
    >
      <p>Vendor: {line.sentence}</p>
      {clock.claims_window_days == null && vendorId && <button className="min-h-11 underline" onClick={() => {
        void import('../command-bar').then(({ openLedger }) => openLedger('orders', { page: 'vendors', vendorId, vendorPage: 'terms' }));
      }}>Add vendor terms in People</button>}
      <p>Carrier: {clock.concealed_carrier_days == null || !clock.carrier_deadline
        ? 'Notice window unknown — check carrier terms'
        : 'Written notice by ' + clock.carrier_deadline.slice(0, 10) + ' (' + clock.concealed_carrier_days + ' days from recorded delivery, per carrier terms).'}</p>
    </div>
  );
}
