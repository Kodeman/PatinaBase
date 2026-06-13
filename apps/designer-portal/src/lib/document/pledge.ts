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
 * Per R30's explicit worked example ("the Pledge returns $84 as teaching
 * royalty"), the Pledge returns to the designer as royalty, so **returned-to-you
 * = the Pledge** (real, accrues YTD). The COMMONS contribution is OPEN brand
 * config (§14.15) — its rate is not ruled — so it renders real-or-placeholder
 * and is never invented. (OPEN / needs design ruling: R37's "money she
 * contributes" could instead mean the commons is carved OUT of her Pledge rather
 * than a Patina match alongside it — that split is the open input. Until ruled,
 * the rendering follows R30: returned = the full Pledge; commons = a separate
 * rate, pending.)
 *
 * Earnings money is stored in CENTS (integer `net_amount`; the live earnings
 * page divides by 100), so every figure here is in cents — format with fmtUsd.
 */

/** R37 — the Pledge is 25% of the Via-Patina commission. Confirmed. */
export const PLEDGE_RATE = 0.25;

/**
 * OPEN (§14.15, brand config — NOT ruled): the commons contribution rate (the
 * "given to the commons" share, as a fraction of the commission). `null` = not
 * yet configured → the commons sub-line renders pending. Wire from marketplace
 * config; never invent it.
 */
export const COMMONS_MATCH_RATE: number | null = null;

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
