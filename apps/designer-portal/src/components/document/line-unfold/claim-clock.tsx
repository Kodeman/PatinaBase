'use client';

import {
  useProcurementClaimDeadline,
  useStudioVendorAccounts,
} from '@patina/supabase';
import { useInternalTimeStudio } from '@/hooks/use-viewer-studio';
import { WEEKDAY_SHORT_FORMAT, dayMonth, parseSourceDate } from '@/lib/document/dates';
import { todayYmd } from '@/lib/document/format';

/** Where the claims window came from (R-PB9): the studio's account with the
 *  vendor, or the default every studio starts with (72 h). */
export type ClaimWindowBasis = 'account' | 'default';

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

/**
 * C-20 / D1-08: the claim clock as one dated sentence, never a countdown.
 * `deadline` is `procurement_claim_deadline.vendor_deadline` (00700), a bare
 * date. Null when there is no deadline yet (not delivered) or it is unreadable.
 */
export function claimClockSentence({
  vendorName,
  deadline,
  windowDays,
  basis,
  today = todayYmd(),
}: {
  vendorName: string;
  deadline: string | null | undefined;
  windowDays: number;
  basis: ClaimWindowBasis;
  /** Local `YYYY-MM-DD`; injectable for tests. */
  today?: string;
}): ClaimClock | null {
  const date = parseSourceDate(deadline ?? null);
  if (!deadline || !date) return null;
  const day = `${WEEKDAY_SHORT_FORMAT.format(date)} ${dayMonth(date)}`;
  const source =
    basis === 'account' ? `per the ${vendorName} account` : 'the studio default';
  const why = `(${windowWords(windowDays)} from delivery, ${source})`;
  const passed = deadline.slice(0, 10) < today;
  return passed
    ? {
        sentence: `${vendorName}'s window closed ${day} ${why} — you can still file.`,
        passed,
      }
    : { sentence: `${vendorName} wants written notice by ${day} ${why}.`, passed };
}

/**
 * The receiving row's claim clock: reads the PO's deadline and the studio's
 * account with the vendor (to name the basis), then prints the sentence.
 * Silent until both answer, and for a PO with no delivered date.
 */
export function ClaimClockLine({
  purchaseOrderId,
  vendorId,
  vendorName,
  className = '',
}: {
  purchaseOrderId: string | null | undefined;
  vendorId: string | null | undefined;
  vendorName: string;
  className?: string;
}) {
  const { data: clock } = useProcurementClaimDeadline(purchaseOrderId);
  const { studio, isSettled } = useInternalTimeStudio();
  const accounts = useStudioVendorAccounts(studio?.id ?? null);
  if (!clock || !isSettled || (studio && accounts.isPending)) return null;
  // The account names the basis. Without one to read (no studio door, or the
  // read failed) the window itself is the evidence: 3 days is R-PB9's default.
  const basis: ClaimWindowBasis = accounts.isSuccess
    ? accounts.data.find((a) => a.vendor_id === vendorId)?.claims_window_days != null
      ? 'account'
      : 'default'
    : clock.claims_window_days === 3
      ? 'default'
      : 'account';
  const line = claimClockSentence({
    vendorName,
    deadline: clock.vendor_deadline,
    windowDays: clock.claims_window_days,
    basis,
  });
  if (!line) return null;
  return (
    <p
      data-testid="claim-clock"
      data-passed={line.passed ? 'true' : undefined}
      className={`${className} ${
        line.passed
          ? 'text-[var(--color-golden-hour-ink)]'
          : 'text-[var(--color-charcoal)]'
      }`}
    >
      {line.sentence}
    </p>
  );
}
