import type { ClientDecision, ProjectApprovalReview } from '@patina/supabase';

import {
  isClientActionableLegacyDecision,
  isClientActionableProjectApproval,
  isProjectApprovalAwaitingStudioIssue,
  projectApprovalAttentionLabel,
} from '../client-attention';

const approval = (
  overrides: Partial<ProjectApprovalReview> = {},
): ProjectApprovalReview =>
  ({
    disposition: 'active',
    lifecycleStatus: 'draft',
    completedReviewCount: 0,
    requiredReviewCount: 1,
    outcome: null,
    ...overrides,
  }) as ProjectApprovalReview;

describe('client attention predicates', () => {
  it.each([
    ['incomplete active draft', approval(), true],
    [
      'completed-review active draft',
      approval({ completedReviewCount: 1 }),
      false,
    ],
    [
      'unanswered active pending approval',
      approval({ lifecycleStatus: 'pending' }),
      true,
    ],
    [
      'pending approval with an outcome',
      approval({ lifecycleStatus: 'pending', outcome: 'approved' }),
      false,
    ],
    [
      'withdrawn incomplete draft',
      approval({ disposition: 'withdrawn' }),
      false,
    ],
  ])('%s has actionable=%s', (_name, review, expected) => {
    expect(isClientActionableProjectApproval(review)).toBe(expected);
  });

  it('identifies only a completed-review active draft as awaiting studio issue', () => {
    expect(
      isProjectApprovalAwaitingStudioIssue(
        approval({ completedReviewCount: 1 }),
      ),
    ).toBe(true);
    expect(isProjectApprovalAwaitingStudioIssue(approval())).toBe(false);
    expect(
      isProjectApprovalAwaitingStudioIssue(
        approval({ lifecycleStatus: 'pending' }),
      ),
    ).toBe(false);
  });

  // One outcome, one word, whichever day she reads it (P-16). The stamp says
  // RETURNED and the prose says Returned; "Declined" belongs to a commercial
  // document, never to an edition sent back for revision.
  it.each([
    [{ disposition: 'withdrawn', outcome: 'approved' }, 'Withdrawn'],
    [{ disposition: 'superseded', outcome: 'changes_requested' }, 'Superseded'],
    [{ disposition: 'active', outcome: 'approved' }, 'Approved'],
    [{ disposition: 'active', outcome: 'changes_requested' }, 'Returned'],
    [{ disposition: 'active', outcome: 'needs_discussion' }, 'Held'],
    [
      {
        disposition: 'active',
        lifecycleStatus: 'draft',
        completedReviewCount: 1,
        requiredReviewCount: 1,
      },
      'Awaiting studio issue',
    ],
    [{ disposition: 'active', lifecycleStatus: 'draft' }, 'Review required'],
    [{ disposition: 'active', lifecycleStatus: 'pending' }, 'Response required'],
  ])('names %p in the house’s one vocabulary', (row, expected) => {
    expect(projectApprovalAttentionLabel(approval(row as Partial<ProjectApprovalReview>))).toBe(
      expected,
    );
  });

  it('never calls a returned edition declined', () => {
    expect(
      projectApprovalAttentionLabel(
        approval({ outcome: 'changes_requested' } as Partial<ProjectApprovalReview>),
      ),
    ).not.toBe('Declined');
  });

  it.each([
    [{ court: null, coordination_kind: null }, true],
    [{ court: 'client', coordination_kind: 'signoff' }, true],
    [{ court: 'designer', coordination_kind: 'selection' }, false],
    [{ court: 'client', coordination_kind: 'rfi' }, false],
  ])('uses the legacy client-court selection/signoff defaults for %p', (row, expected) => {
    expect(
      isClientActionableLegacyDecision(row as ClientDecision),
    ).toBe(expected);
  });
});
