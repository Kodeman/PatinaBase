'use client';

/**
 * The Accounts book · Earnings (R36 / R37). R36 puts design fees, Via-Patina
 * commissions and teaching royalties here; R37 reads it in two bands — *What you
 * earn* (client-work income) and *What teaching returns* (the Designer-Taught
 * loop's income + the two-sided 25% Pledge).
 *
 * THIS SLICE (4) builds the *What you earn* band on real earnings. The *What
 * teaching returns* band and the twinned Pledge are the Aesthete fold (R37,
 * slice 5) — they land here next, on this same page, without disturbing this
 * band. Earnings money is stored in DOLLARS (not cents) — fmtUsdFromDollars.
 */

import { fmtUsdFromDollars } from '@/lib/document/account-summary';

interface EarningsStats {
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  bySource: {
    design_fee: number;
    product_commission: number;
    referral: number;
    bonus: number;
    adjustment: number;
  };
}

function EarnLine({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[rgba(250,247,242,0.1)] py-1.5">
      <span className="text-[12px] text-[var(--color-off-white)]">
        {label}
        {sub && (
          <span className="ml-2 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
            {sub}
          </span>
        )}
      </span>
      <span className="font-mono text-[12px] text-[var(--color-off-white)]">
        {fmtUsdFromDollars(value)}
      </span>
    </div>
  );
}

export function AccountsEarningsPage({ stats }: { stats?: EarningsStats }) {
  if (!stats) {
    return (
      <p className="py-5 font-heading text-[13px] italic text-[rgba(250,247,242,0.5)]">
        Reading your earnings…
      </p>
    );
  }

  const { bySource } = stats;
  // *What you earn* — client-work income (R37 band one). Referral/bonus/
  // adjustment are occasional; fold them into one honest "other" line rather
  // than invent categories.
  const otherCents = bySource.referral + bySource.bonus + bySource.adjustment;
  const clientWork = bySource.design_fee + bySource.product_commission + otherCents;

  return (
    <div>
      <section>
        <h3 className="mb-1 font-heading text-[14px] italic text-[var(--color-pearl)]">
          What you earn
        </h3>
        <p className="mb-2 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.4)]">
          client-work income
        </p>
        <EarnLine label="Design fees" value={bySource.design_fee} />
        <EarnLine label="Via-Patina commissions" value={bySource.product_commission} />
        {otherCents > 0 && <EarnLine label="Other" value={otherCents} sub="referral · bonus · adjustment" />}
        <div className="flex items-baseline justify-between gap-3 pt-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--color-clay)]">
            client work, all time
          </span>
          <span className="font-heading text-[16px] text-[var(--color-off-white)]">
            {fmtUsdFromDollars(clientWork)}
          </span>
        </div>
        <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
          {fmtUsdFromDollars(stats.paidEarnings)} paid · {fmtUsdFromDollars(stats.pendingEarnings)} pending
        </p>
      </section>

      {/* R37 / slice 5 — the Aesthete fold (What teaching returns + the twinned
          25% Pledge) lands here, on this page, beneath this band. */}
      <p className="mt-5 border-t border-[rgba(250,247,242,0.1)] pt-3 font-heading text-[12px] italic text-[rgba(250,247,242,0.45)]">
        What teaching returns — royalties &amp; the 25% Pledge — folds in next.
      </p>
    </div>
  );
}
