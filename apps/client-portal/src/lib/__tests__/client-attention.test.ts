import type { ClientDecision, ProjectApprovalReview } from '@patina/supabase';

import {
  isClientActionableLegacyDecision,
  isClientActionableProjectApproval,
  isProjectApprovalAwaitingStudioIssue,
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
