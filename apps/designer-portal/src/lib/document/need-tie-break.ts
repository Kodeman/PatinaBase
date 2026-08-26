/**
 * The operational needs' tie-break — direction A §3, as revised by C-AP-06,
 * and by A3-L7, which gives `NeedLine` a `dueOn`/`owner` and reads them here.
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

const DAY_MS = 86_400_000;

/** Bare DATE columns parse as LOCAL midnight, matching document-guide.ts's
 *  own `asLocalDate` — a bare ISO date must not slip a day in negative-offset
 *  zones, and a full timestamp parses as itself. */
const asLocalDate = (iso: string): Date =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);

/** Whole calendar days from `now` to `iso` — negative when `iso` is past.
 *  `null` when `iso` does not parse. */
function calendarDaysUntil(iso: string, now: Date): number | null {
  const then = asLocalDate(iso);
  if (Number.isNaN(then.getTime())) return null;
  const thenMidnight = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((thenMidnight - nowMidnight) / DAY_MS);
}

/**
 * A3-L7's dated/owned rank, read directly off the need rather than off its
 * kind — and in the SAME four-rank order the kind table below keeps, because
 * one surface may not rank the same four ideas two ways:
 *   1. `dueOn` lands within the next seven days (today included) AND the
 *      need names an owner that is not the designer — a hard outside
 *      deadline, whoever holds it;
 *   2. `dueOn` has already passed — what is already past its date, sorted
 *      oldest first by the caller;
 *   3. the need names the designer as owner and carries no date at all — the
 *      studio's own pen, against no outside clock.
 *
 * `null` for everything else, INCLUDING a need that states only an owner it
 * shares with its kind's own rank, or a date further out than a week: the
 * caller then reads the kind-based rank, which already knows what the need is.
 * The dated rank may promote a need the kind could not see the urgency of; it
 * may never demote one below what its kind already earned.
 */
function datedRank(need: NeedLine, now: Date): NeedTieBreakRank | null {
  const days = need.dueOn != null ? calendarDaysUntil(need.dueOn, now) : null;
  if (days !== null && days >= 0 && days <= 7 && need.owner && need.owner !== 'designer') {
    return 1;
  }
  if (days !== null && days < 0) return 2;
  if (need.owner === 'designer' && days === null) return 3;
  return null;
}

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
 * is preserved (and, inside rank 3, the older `dueOn` sorts first — "ties
 * inside a rank go to the older date"), and that order is `NEED_RULES`'
 * declaration order, because `deriveNeeds` (desk-derivation.ts:960–1011)
 * pushes in rule order and never sorts. **Total** — every input need comes
 * back, exactly once.
 *
 * A need's rank is `datedRank` when it states a `dueOn` or an `owner`, and
 * the kind-based `needTieBreakRank` otherwise — so a need this wave left
 * undated and unowned ranks exactly as it always has (A1-L2's own
 * falsifier test, kept green below).
 */
export function rankOperationalNeeds(
  needs: readonly NeedLine[],
  now: Date,
): NeedLine[] {
  return needs
    .map((need, index) => ({
      need,
      index,
      rank: datedRank(need, now) ?? needTieBreakRank(need.kind),
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      // Rank 2 is "already past its date, oldest first" — a need with no
      // dueOn (kind-fallback into rank 2) has no date to compare and keeps
      // derivation order against its rank-2 peers.
      if (a.rank === 2 && a.need.dueOn != null && b.need.dueOn != null) {
        const aTime = new Date(a.need.dueOn).getTime();
        const bTime = new Date(b.need.dueOn).getTime();
        if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
          return aTime - bTime;
        }
      }
      return a.index - b.index;
    })
    .map((entry) => entry.need);
}
