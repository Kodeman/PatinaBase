'use client';

/**
 * The Accounts book · Earnings (R36) — one band: what you earn, the studio's
 * client-work income (design fees + Via-Patina commissions + other).
 *
 * Earnings money is stored in CENTS (integer net_amount; the live earnings page
 * divides by 100) — fmtUsd throughout.
 */

import { fmtUsd } from '@/lib/document/format';

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
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--color-pearl)] py-1.5">
      <span className="text-[12px] text-[var(--color-mocha)]">
        {label}
        {sub && (
          <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
            {sub}
          </span>
        )}
      </span>
      <span className="font-mono text-[12px] text-[var(--color-charcoal)]">
        {fmtUsd(value)}
      </span>
    </div>
  );
}

export function AccountsEarningsPage({ stats }: { stats?: EarningsStats }) {
  if (!stats) {
    return (
      <p className="py-5 font-heading text-[13px] italic text-[var(--color-aged-oak)]">
        Reading your earnings…
      </p>
    );
  }

  const { bySource } = stats;
  const otherCents = bySource.referral + bySource.bonus + bySource.adjustment;
  const clientWork = bySource.design_fee + bySource.product_commission + otherCents;

  return (
    <div>
      {/* ── What you earn (client-work income) ── */}
      <section>
        <h3 className="mb-1 font-heading text-[14px] italic text-[var(--color-charcoal)]">
          What you earn
        </h3>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          client-work income
        </p>
        <EarnLine label="Design fees" value={bySource.design_fee} />
        <EarnLine label="Via-Patina commissions" value={bySource.product_commission} />
        {otherCents > 0 && <EarnLine label="Other" value={otherCents} sub="referral · bonus · adjustment" />}
        <div className="flex items-baseline justify-between gap-3 pt-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.07em] text-[var(--color-clay-ink)]">
            client work, all time
          </span>
          <span className="font-heading text-[16px] text-[var(--color-charcoal)]">
            {fmtUsd(clientWork)}
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
          {fmtUsd(stats.paidEarnings)} paid · {fmtUsd(stats.pendingEarnings)} pending
        </p>
      </section>

    </div>
  );
}
