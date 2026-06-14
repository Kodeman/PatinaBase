/**
 * The 25% Pledge (R37 / R30) — the Aesthete fold's brand-critical arithmetic.
 *
 * CONFIRMED (R37, R30 worked example $336 → $84): ordering via Patina earns the
 * designer a commission, and the Pledge is **25% of that commission**.
 *
 * The Pledge is rendered TWO-SIDED and the two directions never blur:
 *   · returned to you — a teaching royalty that accrues to a YTD total
 *   · given to the commons — funds the shared catalog + maker community
 *
 * Per R30's worked example ($336 → $84) and R41's ruling, **returned-to-you =
 * the full 25%** (real, accrues YTD). R41 RESOLVED the R30/R37 tension: the
 * commons share is a **separate Patina contribution ALONGSIDE** her share — a
 * match on top, never a carve-out. The Pledge is generative; it does not shrink
 * what she keeps. The commons rate ships as a **visible provisional default**
 * (R41, the send-weave precedent): a real number, flagged "provisional"
 * in-product, never left as "—" and never presented as final. §14.15 stays open
 * for the FINAL brand/finance number — wiring it later is a one-constant change,
 * no rebuild.
 *
 * Earnings money is stored in CENTS (integer `net_amount`; the live earnings
 * page divides by 100), so every figure here is in cents — format with fmtUsd.
 */

/** R37 — the Pledge is 25% of the Via-Patina commission. Confirmed. */
export const PLEDGE_RATE = 0.25;

/**
 * R41 — the commons contribution rate (the "given to the commons" share, as a
 * fraction of the commission): a **provisional 10%**, a separate Patina match
 * ALONGSIDE the full 25% returned to the designer (never a carve-out). Named and
 * tunable beside PLEDGE_RATE (the R10 / R22 / send-weave constant precedent).
 * Provisional until §14.15 closes with the final brand/finance number — wiring
 * the final value later is a one-constant change, no rebuild. `null` would mean
 * "not yet configured" (renders pending); R41 says never leave it null/"—".
 */
export const COMMONS_MATCH_RATE: number | null = 0.1;

/**
 * R41 — the commons rate above is a PROVISIONAL default, not the final brand
 * number. Drives the in-product "provisional" flag so a provisional figure is
 * never shown as final. Set false when §14.15 lands the confirmed rate.
 */
export const COMMONS_MATCH_PROVISIONAL = true;

const roundCents = (n: number) => Math.round(n);

export interface PledgeEvent {
  /** The Via-Patina commission this Pledge is drawn from (cents). */
  commission: number;
  /** The Pledge, returned to the designer as a teaching royalty (cents). */
  returnedToYou: number;
  /** Given to the commons (cents), or null until COMMONS_MATCH_RATE is set. */
  givenToCommons: number | null;
  earnedAt: string;
  /** Optional label for the source (proposal/client), for the event line. */
  label?: string;
}

/** One commission → its two-sided Pledge. */
export function pledgeFromCommission(
  commission: number,
  earnedAt: string,
  label?: string,
): PledgeEvent {
  return {
    commission,
    returnedToYou: roundCents(commission * PLEDGE_RATE),
    givenToCommons: COMMONS_MATCH_RATE != null ? roundCents(commission * COMMONS_MATCH_RATE) : null,
    earnedAt,
    label,
  };
}

/** YTD total of the royalty that returns to the designer (the accruing crescendo). */
export function pledgeYtdReturned(events: PledgeEvent[], year: number): number {
  return events
    .filter((e) => e.earnedAt && new Date(e.earnedAt).getFullYear() === year)
    .reduce((s, e) => s + e.returnedToYou, 0);
}

/** Whether the commons share is configured yet (drives the pending flag). */
export const commonsRateKnown = COMMONS_MATCH_RATE != null;
