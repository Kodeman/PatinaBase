import type { ClientDecision, ProjectApprovalReview } from '@patina/supabase';

type ProjectApprovalAttention = Pick<
  ProjectApprovalReview,
  | 'disposition'
  | 'lifecycleStatus'
  | 'completedReviewCount'
  | 'requiredReviewCount'
  | 'outcome'
>;

type LegacyDecisionAttention = Pick<
  ClientDecision,
  'court' | 'coordination_kind'
>;

/** The single Stage-2 definition of work that is currently in the client's court. */
export function isClientActionableProjectApproval(
  approval: ProjectApprovalAttention,
): boolean {
  if (approval.disposition !== 'active') return false;

  if (approval.lifecycleStatus === 'draft') {
    return approval.completedReviewCount < approval.requiredReviewCount;
  }

  return approval.lifecycleStatus === 'pending' && approval.outcome === null;
}

/** Review is complete, but the studio has not issued the frozen approval yet. */
export function isProjectApprovalAwaitingStudioIssue(
  approval: ProjectApprovalAttention,
): boolean {
  return (
    approval.disposition === 'active' &&
    approval.lifecycleStatus === 'draft' &&
    approval.completedReviewCount >= approval.requiredReviewCount
  );
}

/**
 * Legacy client decisions default to the historical client selection contract.
 * Only selection/sign-off work in the client's court contributes attention.
 */
export function isClientActionableLegacyDecision(
  decision: LegacyDecisionAttention,
): boolean {
  const court = decision.court ?? 'client';
  if (court !== 'client') return false;

  const kind = decision.coordination_kind ?? 'selection';
  return kind === 'selection' || kind === 'signoff';
}

export function projectApprovalAttentionLabel(
  approval: ProjectApprovalReview,
): string {
  if (approval.disposition === 'withdrawn') return 'Withdrawn';
  if (approval.disposition === 'superseded') return 'Superseded';
  if (approval.outcome === 'approved') return 'Approved';
  // One outcome, one word, on the day she answers and on every visit after:
  // `changes_requested` is RETURNED on the stamp and Returned in prose, and is
  // never "Declined" — a commercial document is declined; an edition is sent
  // back (P-16).
  if (approval.outcome === 'changes_requested') return 'Returned';
  if (approval.outcome === 'needs_discussion') return 'Held';
  if (isProjectApprovalAwaitingStudioIssue(approval)) {
    return 'Awaiting studio issue';
  }
  if (approval.lifecycleStatus === 'draft') return 'Review required';
  // Elapsed time is a studio condition, never a client-side judgment
  // (Ruling VIII) — overdue and on-time both fall through to the same
  // plain status here.
  return 'Response required';
}
