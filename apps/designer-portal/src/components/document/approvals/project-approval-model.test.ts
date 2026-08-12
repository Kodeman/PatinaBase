import {
  eligibleSupersessionCandidates,
  parseSignedDelta,
  projectApprovalActions,
  toFutureDueAt,
} from './project-approval-model';
import type {
  ProjectApprovalArtifactCandidate,
  ProjectApprovalReview,
} from '@patina/supabase';

const review = {
  decisionId: 'decision-1',
  projectId: 'project-1',
  phaseId: 'phase-1',
  artifactKind: 'plan_issue',
  artifactId: 'issue-1',
  artifactChecksum: 'a'.repeat(64),
  lifecycleStatus: 'draft',
  disposition: 'active',
  successorDecisionId: null,
  completedReviewCount: 0,
  requiredReviewCount: 1,
} as ProjectApprovalReview;

describe('project approval authoring rules', () => {
  it('requires explicit signed integer deltas and preserves zero', () => {
    expect(parseSignedDelta('0', 'Cost')).toBe(0);
    expect(parseSignedDelta('-2', 'Schedule')).toBe(-2);
    expect(parseSignedDelta('+7', 'Lead time')).toBe(7);
    expect(() => parseSignedDelta('', 'Cost')).toThrow('Cost is required');
    expect(() => parseSignedDelta('1.5', 'Cost')).toThrow(
      'Cost must be a whole signed number',
    );
    expect(parseSignedDelta('-2147483648', 'Cost')).toBe(-2147483648);
    expect(parseSignedDelta('2147483647', 'Cost')).toBe(2147483647);
    expect(() => parseSignedDelta('-2147483649', 'Cost')).toThrow(
      'Cost must fit a signed 32-bit integer',
    );
    expect(() => parseSignedDelta('2147483648', 'Cost')).toThrow(
      'Cost must fit a signed 32-bit integer',
    );
  });

  it('requires a genuinely future due instant', () => {
    expect(
      toFutureDueAt('2026-08-11T12:00', new Date('2026-08-10T12:00:00Z')),
    ).toBe(new Date('2026-08-11T12:00').toISOString());
    expect(() =>
      toFutureDueAt('2026-08-09T12:00', new Date('2026-08-10T12:00:00Z')),
    ).toThrow('Due date must be in the future');
  });

  it('gates publish on frozen review counts and exposes only valid leaf actions', () => {
    expect(projectApprovalActions(review)).toEqual({
      publish: false,
      withdraw: true,
      supersede: false,
    });
    expect(
      projectApprovalActions({
        ...review,
        completedReviewCount: 1,
      }),
    ).toEqual({ publish: true, withdraw: true, supersede: false });
    expect(
      projectApprovalActions({
        ...review,
        lifecycleStatus: 'responded',
        outcome: 'changes_requested',
      }),
    ).toEqual({ publish: false, withdraw: false, supersede: true });
    expect(
      projectApprovalActions({
        ...review,
        lifecycleStatus: 'responded',
        successorDecisionId: 'decision-2',
      }),
    ).toEqual({ publish: false, withdraw: false, supersede: false });
    expect(
      projectApprovalActions(
        {
          ...review,
          lifecycleStatus: 'responded',
          outcome: 'approved',
        },
        { boundPhaseCompleted: true },
      ),
    ).toEqual({ publish: false, withdraw: false, supersede: false });
  });

  it('offers supersession only when both the source and checksum are new', () => {
    const candidates = [
      {
        artifactKind: 'plan_issue',
        artifactId: 'issue-1',
        artifactChecksum: 'a'.repeat(64),
      },
      {
        artifactKind: 'plan_issue',
        artifactId: 'issue-2',
        artifactChecksum: 'a'.repeat(64),
      },
      {
        artifactKind: 'plan_issue',
        artifactId: 'issue-2',
        artifactChecksum: 'b'.repeat(64),
      },
    ] as ProjectApprovalArtifactCandidate[];

    expect(eligibleSupersessionCandidates(review, candidates)).toEqual([
      candidates[2],
    ]);
  });
});
