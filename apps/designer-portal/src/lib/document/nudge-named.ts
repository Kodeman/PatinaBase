/**
 * US-19 FR6 F6-1 (D1-a, D1-d) — what a Nudge names when it lands on the
 * letterhead's Message composer: the `Waiting on {first}: …` line's clauses.
 * The proposal clause leads while one is out with her; the overdue decisions
 * follow. One builder for the band's own act and the standing sheet's need
 * rows, so the two presses name the same things.
 */

import { fmtDay } from './format';
import { partitionMargin, type MarginItemRow } from './margin-derivation';

/** The approval fields the `overdue_decision` landing reads. */
export interface OverdueApprovalFacts {
  disposition: string;
  outcome: string | null;
  isOverdue: boolean;
  artifactTitle: string;
}

/** A project's overdue decisions, by the approvals filter the
 *  `overdue_decision` row has always used. */
export function overdueApprovalTitles(
  approvals: readonly OverdueApprovalFacts[],
): string[] {
  return approvals
    .filter(
      (approval) =>
        approval.disposition === 'active' &&
        approval.outcome !== 'approved' &&
        approval.isOverdue,
    )
    .map((approval) => approval.artifactTitle)
    .filter(Boolean);
}

/** A paper's overdue decisions in the order the margin prints them. A
 *  proposal paper's decisions hang off the proposal, not a project, so the
 *  approvals read never sees them; the margin does. */
export function overdueMarginDecisionTitles(
  rows: readonly MarginItemRow[],
  now: Date,
): string[] {
  return partitionMargin([...rows], now)
    .raised.filter((row) => row.kind === 'decision' && row.state === 'overdue')
    .map((row) => row.title)
    .filter(Boolean);
}

/** The `named` a Nudge's `composeMessage` landing carries: `the proposal, sent
 *  {day}` first while the proposal is sent or viewed, then the decisions. */
export function waitingOnNamed(
  proposal: { status: string | null | undefined; sentAt: string | null | undefined } | null,
  decisions: readonly string[],
): string[] {
  const out =
    proposal?.sentAt && (proposal.status === 'sent' || proposal.status === 'viewed')
      ? [`the proposal, sent ${fmtDay(proposal.sentAt)}`]
      : [];
  return [...out, ...decisions];
}
