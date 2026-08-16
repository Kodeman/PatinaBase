/**
 * The Finalize table's one inked leader (Start to Signature W4a, flag
 * `worktable`).
 *
 * A proposal in the client's hands is parked: nothing the designer does
 * advances it, so the table's leader is not "the next step" — it is the one
 * act that is actually available right now, read off three sources that
 * already exist and can disagree: the proposal's lifecycle (the watch model),
 * the client's per-line verdicts (the roll-up), and the send wall's own
 * nudge decision.
 *
 * Two rules the matrix below enforces rather than re-litigates:
 *
 *   · The nudge is NEVER decided here. `deriveSendWallLine` (W1) already owns
 *     the issued-on-paper guard, the countersign hold and the three-day
 *     cooldown; this composes it and offers the nudge only when that function
 *     offers the verb. A second nudge decision is how a paper-issued agreement
 *     gets emailed a reminder it was never meant to receive.
 *
 *   · Revise is retired and stays retired (legacy retirement, I91): a changed
 *     mind travels as a design services agreement, not a cloned revision. No
 *     leader in this table resurrects it.
 *
 * Every verb returned exists on the document today — the watch's Preview and
 * Email-delivery acts, the send wall's nudge, and the Desk's flagged-lines
 * walk-in. Pure, React-free, unit-testable (the proposal-watch-derivation
 * precedent).
 */

import type { VerdictRollup } from '@patina/utils';
import {
  deriveSendWallLine,
  type ProposalWatchModel,
} from './proposal-watch-derivation';

export type FinalizeLeaderKind =
  | 'answer-flags'
  | 'nudge'
  | 'preview'
  | 'resend';

export interface FinalizeLeader {
  kind: FinalizeLeaderKind;
  label: string;
  /** Only on 'answer-flags': the line the walk-in unfolds. Null when the
   *  verdicts say lines are flagged but no line id came back with them. */
  flaggedItemId: string | null;
}

export interface FinalizeLeaderInput {
  watch: ProposalWatchModel;
  /** `proposals.commercial_state` — null on a legacy proposal. */
  commercialState: string | null;
  /** `proposals.issued_on_paper` (00477). */
  issuedOnPaper: boolean;
  /** The client's verdicts, folded (rollupVerdicts). */
  rollup: VerdictRollup;
  /** The oldest unresolved rejection's `proposal_item_id`. */
  firstFlaggedItemId: string | null;
  /** `familyLabel(clientName)` — the household as every other wall says it. */
  family: string;
}

/** Commercial states whose own status block states the whole story; a leader
 *  over the top of it would be a second, thinner telling. Mirrors the send
 *  wall's stood-down set. */
const LEADER_STOOD_DOWN_STATES = ['executed', 'declined', 'superseded'];

/**
 * The leader, or null when the table has nothing to offer and the status block
 * speaks for itself (signed, declined, superseded, executed).
 */
export function deriveFinalizeLeader(
  {
    watch,
    commercialState,
    issuedOnPaper,
    rollup,
    firstFlaggedItemId,
    family,
  }: FinalizeLeaderInput,
  now: Date,
): FinalizeLeader | null {
  // The seal speaks; so does a terminal commercial edition.
  if (watch.settled) return null;
  if (commercialState && LEADER_STOOD_DOWN_STATES.includes(commercialState)) {
    return null;
  }
  // Declined and superseded are stated by the watch's own status line.
  if (watch.status === 'declined' || watch.status === 'revised') return null;
  // A draft has no finalize table; if one is ever composed anyway, it gets no
  // leader rather than a verb aimed at a document nobody has sent.
  if (!watch.awaitingClient && !watch.terminal) return null;

  // The client asked for changes: that is the work, ahead of any reminder.
  if (rollup.unresolvedFlags > 0) {
    return {
      kind: 'answer-flags',
      label: 'Answer the flags',
      flaggedItemId: firstFlaggedItemId,
    };
  }

  // Everything approved and still unsigned — the only thing left is to ask.
  // The asking is the send wall's decision, not this one.
  const everyLineApproved = rollup.total > 0 && rollup.approved === rollup.total;
  if (everyLineApproved) {
    const wall = deriveSendWallLine(
      { watch, commercialState, issuedOnPaper },
      now,
    );
    if (wall?.verb === 'nudge') {
      return { kind: 'nudge', label: `Nudge ${family}`, flaggedItemId: null };
    }
  }

  // Nothing to answer and no reminder available: the leader is the watch's own
  // act for this state — the delivery record once it has expired, the client's
  // copy while it is still out.
  if (watch.terminal) {
    return {
      kind: 'resend',
      label: 'Email delivery status',
      flaggedItemId: null,
    };
  }
  return { kind: 'preview', label: `Preview as ${family}`, flaggedItemId: null };
}

/** The oldest unresolved rejection's line — the Drafting Room's own choice
 *  (drafting-room.tsx's `firstFlaggedItemId`), addressable so the leader and
 *  the walk-in it opens cannot pick different lines. */
export function firstFlaggedLineId(
  feedback: readonly {
    verdict: string;
    resolved_at?: string | null;
    proposal_item_id?: string | null;
    created_at: string;
  }[],
): string | null {
  const open = feedback.filter(
    (f) => f.verdict === 'rejected' && !f.resolved_at && f.proposal_item_id,
  );
  if (open.length === 0) return null;
  return (
    open.reduce((a, b) => (a.created_at <= b.created_at ? a : b))
      .proposal_item_id ?? null
  );
}
