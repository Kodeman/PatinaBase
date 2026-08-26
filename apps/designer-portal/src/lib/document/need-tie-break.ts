/**
 * The operational needs' tie-break — direction A §3, as revised by C-AP-06.
 *
 * Four ranks, in this order:
 *   1. a hard outside deadline inside seven days — a carrier window, a
 *      workroom's COM date, an install-blocking date — whoever owns it;
 *   2. what is already past its date;
 *   3. what the studio can move today, against no outside clock;
 *   4. undated setup chores last.
 *
 * Ranks 2 and 3 are the reverse of direction A §3's own clause order, because
 * the same source states a falsifier that clause order cannot satisfy: "a
 * one-day-old studio chore must NOT outrank a three-week-overdue client
 * decision" (program-plan.md, A1-L1 "Tests to write"). The falsifier is the
 * acceptance, so overdue leads the studio's own pen.
 *
 * Pure: no React, no DOM, and no import that reaches @portabletext (the Jest
 * ESM trap) — the same dependency discipline desk-derivation.ts keeps.
 */

import type { NeedKind, NeedLine } from './desk-derivation';

export type NeedTieBreakRank = 1 | 2 | 3 | 4;

/**
 * Rank per kind, exhaustive over `NeedKind` so a new kind is a type error
 * rather than a silent rank-1.
 *
 * The ranks are read off the KIND because `NeedLine` states its date only
 * inside its own prose (`text`) and states no owner at all — see the note on
 * `rankOperationalNeeds` below. Each group is therefore the set of kinds whose
 * derivation can only fire under that rank's condition:
 *
 *   1 — the date behind the need was set outside the studio and the derivation
 *       raises the need as that date closes (a carrier claim window, a delivery
 *       inspection window, an install-blocking collision).
 *   2 — the date behind the need has already passed.
 *   3 — the next move is the designer's own pen, against no outside clock.
 *   4 — setup work carrying no date at all.
 *
 * `new_lead` sits in rank 3, not rank 1: `needLead` (desk-derivation.ts:728–747)
 * raises it for any new/viewed lead, dated or not — "New lead — respond" is its
 * undated text — so the kind carries no outside clock to rank on.
 */
const TIE_BREAK_RANK: Record<NeedKind, NeedTieBreakRank> = {
  damage_claim: 1,
  awaiting_inspection: 1,
  schedule_conflict: 1,

  overdue_decision: 2,
  overdue_invoice: 2,
  proposal_expired: 2,
  reconnect_due: 2,
  task_due: 2,
  po_unacknowledged: 2,

  new_lead: 3,
  proposal_signed: 3,
  proposal_declined: 3,
  lines_flagged: 3,
  ceremony_pending: 3,
  hesitating_proposal: 3,
  schedule_proposal: 3,
  pulse_due: 3,
  po_unsent: 3,

  schedule_unconfigured: 4,
};

export function needTieBreakRank(kind: NeedKind): NeedTieBreakRank {
  return TIE_BREAK_RANK[kind];
}

/**
 * The needs, re-ordered by the four ranks. **Stable** — equal-rank input order
 * is preserved, and that order is `NEED_RULES`' declaration order, because
 * `deriveNeeds` (desk-derivation.ts:960–1011) pushes in rule order and never
 * sorts. **Total** — every input need comes back, exactly once.
 *
 * Two clauses of direction A §3 are NOT implemented here and are scheduled for
 * A3, where `NeedLine` gains a deadline and an owner: rank 1's "inside seven
 * days" test (the kind stands in for the clock) and "ties inside a rank go to
 * the older date" (no date is read, so equal-rank order is the derivation
 * chain's). `now` is part of the contract A1-L2 already imports and is read by
 * neither clause yet.
 */
export function rankOperationalNeeds(
  needs: readonly NeedLine[],
  now: Date,
): NeedLine[] {
  return needs
    .map((need, index) => ({ need, index }))
    .sort(
      (a, b) =>
        needTieBreakRank(a.need.kind) - needTieBreakRank(b.need.kind) ||
        a.index - b.index,
    )
    .map((entry) => entry.need);
}
