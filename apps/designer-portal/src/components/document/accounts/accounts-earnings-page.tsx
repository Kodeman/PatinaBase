'use client';

/**
 * The Accounts book · Earnings (R36 / R37) — the Aesthete fold. Two bands:
 *   · What you earn — client-work income (design fees + Via-Patina commissions)
 *   · What teaching returns — the Designer-Taught loop's income + the two-sided
 *     25% Pledge
 *
 * The Pledge is twinned and the two directions never blur (R37): each event
 * shows "returned to you" (a teaching royalty accruing to a YTD total) and
 * "given to the commons". R41 ruled the commons a SEPARATE match on top: returned
 * = the full 25% (real, YTD), commons = a provisional 10% Patina contribution
 * ALONGSIDE it (never a carve-out). The commons renders a real number flagged
 * "provisional" in-product — never "—", never presented as final; §14.15 stays
 * open for the FINAL brand/finance rate (see pledge.ts).
 *
 * Earnings money is stored in CENTS (integer net_amount; the live earnings page
 * divides by 100) — fmtUsd throughout.
 */

import { fmtDay, fmtUsd } from '@/lib/document/format';
import {
  COMMONS_MATCH_PROVISIONAL,
  COMMONS_MATCH_RATE,
  commonsRateKnown,
  PLEDGE_RATE,
  type PledgeEvent,
} from '@/lib/document/pledge';

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
          <span className="ml-2 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
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

export function AccountsEarningsPage({
  stats,
  pledgeEvents,
  pledgeYtd,
}: {
  stats?: EarningsStats;
  pledgeEvents: PledgeEvent[];
  /** YTD total of the royalty returned to the designer (the accruing crescendo). */
  pledgeYtd: number;
}) {
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
      {/* ── Band one — What you earn (client-work income) ── */}
      <section>
        <h3 className="mb-1 font-heading text-[14px] italic text-[var(--color-charcoal)]">
          What you earn
        </h3>
        <p className="mb-2 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          client-work income
        </p>
        <EarnLine label="Design fees" value={bySource.design_fee} />
        <EarnLine label="Via-Patina commissions" value={bySource.product_commission} />
        {otherCents > 0 && <EarnLine label="Other" value={otherCents} sub="referral · bonus · adjustment" />}
        <div className="flex items-baseline justify-between gap-3 pt-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--color-clay)]">
            client work, all time
          </span>
          <span className="font-heading text-[16px] text-[var(--color-charcoal)]">
            {fmtUsd(clientWork)}
          </span>
        </div>
        <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
          {fmtUsd(stats.paidEarnings)} paid · {fmtUsd(stats.pendingEarnings)} pending
        </p>
      </section>

      {/* ── Band two — What teaching returns (the Aesthete fold, R37) ── */}
      <section className="mt-6 border-t border-[var(--color-pearl)] pt-4">
        <h3 className="mb-1 font-heading text-[14px] italic text-[var(--color-charcoal)]">
          What teaching returns
        </h3>
        <p className="mb-3 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          taught-taste income · the {Math.round(PLEDGE_RATE * 100)}% Pledge
        </p>

        {/* The accruing crescendo: the Pledge, returned to you, YTD. */}
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-[var(--color-pearl)] pb-2">
          <span className="font-heading text-[12.5px] italic text-[var(--color-charcoal)]">
            The Pledge, returned to you{' '}
            <span className="font-mono text-[8.5px] not-italic uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
              year to date
            </span>
          </span>
          <span className="font-heading text-[16px] text-[var(--color-sage)]">
            {fmtUsd(pledgeYtd)}
          </span>
        </div>

        {pledgeEvents.length === 0 ? (
          <p className="py-2 text-[12px] italic text-[var(--color-aged-oak)]">
            No Via-Patina orders yet — the Pledge begins with your first.
          </p>
        ) : (
          <ul>
            {pledgeEvents.map((ev, i) => (
              <li
                key={`${ev.earnedAt}-${i}`}
                className="border-b border-dashed border-[var(--color-pearl)] py-2"
              >
                <p className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                  {ev.label ?? 'Via Patina'}
                  {ev.earnedAt ? ` · ${fmtDay(ev.earnedAt)}` : ''} · {fmtUsd(ev.commission)} commission
                </p>
                {/* The twinned sub-lines — labelled on the face, never blurred. */}
                <div className="grid grid-cols-2 gap-2">
                  <span className="flex items-baseline justify-between gap-2 rounded-[3px] border border-[rgba(133,148,124,0.3)] px-2 py-1">
                    <span className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--color-sage)]">
                      returned to you
                    </span>
                    <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                      {fmtUsd(ev.returnedToYou)}
                    </span>
                  </span>
                  <span className="flex items-baseline justify-between gap-2 rounded-[3px] border border-[rgba(196,165,123,0.3)] px-2 py-1">
                    <span className="flex flex-col">
                      <span className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--color-clay)]">
                        given to the commons
                      </span>
                      {COMMONS_MATCH_PROVISIONAL && COMMONS_MATCH_RATE != null && (
                        <span className="font-mono text-[7px] uppercase tracking-[0.04em] text-[rgba(196,165,123,0.7)]">
                          provisional · {Math.round(COMMONS_MATCH_RATE * 100)}%
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                      {ev.givenToCommons != null ? fmtUsd(ev.givenToCommons) : '—'}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Honest flag: the commons share is a provisional default (R41), with
            the FINAL brand/finance number still open (§14.15) — flagged, never
            presented as final, never left as "—". */}
        {COMMONS_MATCH_PROVISIONAL && COMMONS_MATCH_RATE != null && (
          <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
            the commons share is provisional ({Math.round(COMMONS_MATCH_RATE * 100)}%) — final rate awaits brand config (§14.15)
          </p>
        )}
        {!commonsRateKnown && (
          <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
            the commons share awaits brand config (§14.15) — never invented
          </p>
        )}
      </section>
    </div>
  );
}
