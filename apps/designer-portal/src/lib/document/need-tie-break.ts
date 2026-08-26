/**
 * The operational needs' tie-break — direction A §3, as revised by C-AP-06.
 *
 * Four ranks, in this order:
 *   1. a hard outside deadline inside seven days — a carrier window, a
 *      workroom's COM date, an install-blocking date — whoever owns it;
 *   2. what the studio can move today (`owner === Designer`);
 *   3. oldest overdue;
 *   4. undated setup chores last.
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
 *       inspection window, an install-blocking collision, an inquiry's response
 *       deadline).
 *   2 — the next move is the designer's own pen, against no outside clock.
 *   3 — the date behind the need has already passed.
 *   4 — setup work carrying no date at all.
 */
const TIE_BREAK_RANK: Record<NeedKind, NeedTieBreakRank> = {
  damage_claim: 1,
  awaiting_inspection: 1,
  schedule_conflict: 1,
  new_lead: 1,

  proposal_signed: 2,
  proposal_declined: 2,
  lines_flagged: 2,
  ceremony_pending: 2,
  hesitating_proposal: 2,
  schedule_proposal: 2,
  pulse_due: 2,
  po_unsent: 2,

  overdue_decision: 3,
  overdue_invoice: 3,
  proposal_expired: 3,
  reconnect_due: 3,
  task_due: 3,
  po_unacknowledged: 3,

  schedule_unconfigured: 4,
};

export function needTieBreakRank(kind: NeedKind): NeedTieBreakRank {
  return TIE_BREAK_RANK[kind];
}

/**
 * The needs, re-ordered by the four ranks. **Stable** — equal-rank input order
 * is preserved, which is how the older date still wins inside a rank: the Desk
 * composition hands `folder.needs` over already priority-ordered by its own
 * dated derivation, and this sort never disturbs that order. **Total** — every
 * input need comes back, exactly once.
 *
 * `now` is part of the contract A1-L2 imports and is not read yet: rank 1's
 * "inside seven days" test needs the deadline itself, and `NeedLine` carries no
 * date field (only the formatted date inside `text`) and no owner. Putting one
 * there is a change to `desk-derivation.ts`, which no wave-A1 lane owns.
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
