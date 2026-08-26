/**
 * The guide's sixth rung, derived from the ticket on screen.
 *
 * `deriveDocumentGuide`'s rungs one to five stand as built. Rung six used to
 * read a table: `stageCopy[stage]`, a sentence chosen by the stage alone, which
 * could announce that nothing is waiting while the ticket two inches above it
 * printed a damaged line. Here the sentence is elected from the same rows the
 * reader is looking at, so the guide can never name what the map does not show.
 *
 * Fourteen states, seven stages twice over:
 *
 *   - a row is unclear — the leader names it in the ticket's own words, the
 *     row's label and the row's exception clause, and the act is the stage's
 *     own act from `stageCopy`;
 *   - no row is unclear — the stage's rest sentence and act from `restCopy`
 *     (direction-b §3.2: "with no row unclear, the guide prints the stage's
 *     rest state, never a shrug").
 *
 * Both halves are wired: `deriveDocumentGuide` elects the first from rung six
 * and takes the second in its rest branch, substituting the two facts this
 * module is not passed (`install`'s day, and the landing the stage's working
 * act already resolved).
 *
 * The exception half QUOTES rather than composes — the row's own label and the
 * row's own exception clause, both already printed on the paper. A per-stage
 * sentence template would be the static table F18 named and this module
 * replaced, one indirection further back.
 *
 * `stageCopy` and `restCopy` stay in `document-guide.ts` as the vocabulary this
 * module speaks; they stop being the precedence. The import back into that file
 * is a cycle, and a deliberate one: nothing here reads either table at module
 * load, only inside a call, so both are settled by the time a leader is asked
 * for.
 *
 * Which unclear row leads is direction-b §3.2's tie-break, stated once and
 * encoded here. Its §3.3 project example contradicts it — the example elects an
 * unanswered PO (rank three) over two dated approvals (rank two). **The
 * tie-break wins**; the example is wrong.
 */

import type { SectionKey } from './desk-derivation';
import {
  restCopy,
  stageCopy,
  type DocumentGuideAction,
  type DocumentGuideDestination,
} from './document-guide';
import type { TicketException, TicketExceptionRank, TicketRow } from './ticket-derivation';

export interface TicketLeader {
  headline: string;
  /** `null` on `brief`'s rest state alone — "Nothing to decide yet." asks for
   *  nothing, and `restCopy` states that by carrying no label. */
  action: DocumentGuideAction | null;
}

/**
 * direction-b §3.2's three standing ranks, in order. Its fourth — everything
 * else, in ticket order — is not a rank and has no producer: it IS the row
 * order, which the comparator falls back to. `deriveTicketSeam` keeps the same
 * table for the seam's two lines; the ticket's file is another lane's, so the
 * order is restated rather than reached for.
 */
const RANK_ORDER: Record<TicketExceptionRank, number> = {
  'money-at-risk': 0,
  'promise-past-due': 1,
  'piece-stuck': 2,
};

/** Does the candidate lead over the standing one? Rank first, then the older
 *  date inside a rank (a row standing since no stated day sorts last, having
 *  no age to weigh), then the ticket's own row order. */
function outranks(
  candidate: TicketException,
  candidateOrder: number,
  standing: TicketException,
  standingOrder: number,
): boolean {
  const rank = RANK_ORDER[candidate.rank] - RANK_ORDER[standing.rank];
  if (rank !== 0) return rank < 0;
  const since = candidate.standingSince;
  const standingSince = standing.standingSince;
  if (since !== standingSince) {
    if (since == null) return false;
    if (standingSince == null) return true;
    return since < standingSince;
  }
  return candidateOrder < standingOrder;
}

/**
 * The one row the guide's sentence is about, or `null` where the ticket shows
 * nothing wrong. Only rows this ticket prints are candidates — a spread that
 * does not print a row hands no row here, and the guide cannot name it.
 */
export function leadTicketException(rows: readonly TicketRow[]): TicketRow | null {
  let lead: { row: TicketRow; exception: TicketException; order: number } | null = null;
  for (let order = 0; order < rows.length; order += 1) {
    const row = rows[order];
    const exception = row.exception;
    if (!exception) continue;
    if (lead === null || outranks(exception, order, lead.exception, lead.order)) {
      lead = { row, exception, order };
    }
  }
  return lead?.row ?? null;
}

/**
 * The rest act's landing when this module is asked on its own — every stage
 * keeps its working landing except `discovery`, whose rest act names the
 * DIRECTION and must not point back at the checklist it has just called
 * complete (C20). `deriveDocumentGuide` overrides it with the landing it has
 * already resolved for the row (the FF&E heading, the movement column, the
 * drafting room), which is the richer of the two and the one that ships.
 */
function restDestination(stage: SectionKey): DocumentGuideDestination {
  return stage === 'discovery'
    ? stageCopy.direction.action!.destination
    : stageCopy[stage].action!.destination;
}

export function deriveTicketLeader(
  rows: readonly TicketRow[],
  stage: SectionKey,
): TicketLeader {
  const lead = leadTicketException(rows);
  if (lead?.exception) {
    return {
      // The row's own label and the row's own exception clause, joined the way
      // the ticket joins its parts. Both halves are printed on the paper
      // already; the guide quotes, it does not compose.
      headline: `${lead.label} · ${lead.exception.phrase}`,
      action: stageCopy[stage].action,
    };
  }

  const rest = restCopy[stage];
  return {
    // `install`'s rest sentence is a template, and the day it states lives in
    // the schedule facts the guide holds and this function is not passed. The
    // vocabulary's row is stated here; `deriveDocumentGuide` substitutes the
    // dated form on the spread (`installGuideHeadline`), and it is the only
    // caller, so the template never reaches paper.
    headline: rest.headline,
    action:
      rest.actionLabel === null
        ? null
        : {
            key: `rest-${stage}`,
            label: rest.actionLabel,
            destination: restDestination(stage),
          },
  };
}
