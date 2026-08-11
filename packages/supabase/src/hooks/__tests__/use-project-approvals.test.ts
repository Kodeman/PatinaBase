import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invalidateQueries = vi.fn(() => Promise.resolve());
const channelOn = vi.fn();
const channelSubscribe = vi.fn();
const removeChannel = vi.fn(() => Promise.resolve());
const channel: Record<string, unknown> = {};
channel.on = (...args: unknown[]) => {
  channelOn(...args);
  return channel;
};
channel.subscribe = () => {
  channelSubscribe();
  return channel;
};
let effectCleanup: (() => void) | void;

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    rpc,
    channel: () => channel,
    removeChannel,
  }),
}));

vi.mock('react', () => ({
  useEffect: (effect: () => (() => void) | void) => {
    effectCleanup = effect();
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  invalidateProjectApprovalQueries,
  parseProjectApprovalArtifactCandidate,
  parseProjectApprovalReview,
  useConfirmProjectApprovalReview,
  useCreateProjectApproval,
  useProjectApprovalRealtime,
  useProjectApprovalByDecision,
  useProjectApprovalArtifactCandidates,
  useProjectApprovals,
  useMyProjectApprovalReviews,
  usePublishProjectApproval,
  useRespondProjectApproval,
  useSetProjectDecisionAuthority,
  useSupersedeProjectApproval,
  useWithdrawProjectApproval,
} from '../use-project-approvals';

const REVIEW = {
  decisionId: 'decision-1',
  projectId: 'project-1',
  phaseId: 'phase-1',
  sectionKey: 'project',
  artifactKind: 'budget_version',
  artifactId: 'artifact-1',
  artifactVersion: 3,
  artifactChecksum: 'a'.repeat(64),
  artifactTitle: 'Budget checkpoint 03',
  question: 'Approve this exact budget checkpoint?',
  context: null,
  dueAt: '2026-09-01T12:00:00.000Z',
  costCentsDelta: 0,
  scheduleDaysDelta: 0,
  leadTimeDaysDelta: 0,
  lifecycleStatus: 'pending',
  outcome: null,
  disposition: 'active',
  isOverdue: false,
  completedReviewCount: 1,
  requiredReviewCount: 1,
  authorityRevision: 4,
  predecessorDecisionId: null,
  successorDecisionId: null,
  createdAt: '2026-08-10T12:00:00.000Z',
  sentAt: '2026-08-10T12:05:00.000Z',
  respondedAt: null,
  updatedAt: '2026-08-10T12:05:00.000Z',
};

type MutationConfig<TInput> = {
  mutationFn: (input: TInput) => Promise<unknown>;
  onSuccess?: (result: any, input: TInput) => Promise<void> | void;
};

beforeEach(() => {
  rpc.mockReset();
  invalidateQueries.mockReset();
  invalidateQueries.mockResolvedValue(undefined);
  channelOn.mockReset();
  channelSubscribe.mockReset();
  removeChannel.mockReset();
  removeChannel.mockResolvedValue(undefined);
  effectCleanup = undefined;
});

describe('project approval sanitized reads', () => {
  it('reads one exact safe projection and returns null when the RPC withholds it', async () => {
    rpc.mockResolvedValueOnce({ data: REVIEW, error: null });
    const exact = useProjectApprovalByDecision('decision-1') as unknown as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(exact.queryKey).toEqual(['project-approval', 'decision-1']);
    await expect(exact.queryFn()).resolves.toEqual(
      expect.objectContaining({ decisionId: 'decision-1' }),
    );
    expect(rpc).toHaveBeenLastCalledWith('get_project_decision_review', {
      p_decision_id: 'decision-1',
    });

    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(exact.queryFn()).resolves.toBeNull();
  });

  it('reads the caller-global safe projection only as an array', async () => {
    rpc.mockResolvedValueOnce({ data: [REVIEW], error: null });
    const mine = useMyProjectApprovalReviews() as unknown as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown[]>;
    };
    expect(mine.queryKey).toEqual(['my-project-approval-reviews']);
    await expect(mine.queryFn()).resolves.toEqual([
      expect.objectContaining({ decisionId: 'decision-1' }),
    ]);
    expect(rpc).toHaveBeenLastCalledWith(
      'list_my_project_decision_reviews',
      {},
    );

    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(mine.queryFn()).rejects.toThrow(
      'list_my_project_decision_reviews returned an invalid list',
    );
  });

  it('reads only the immutable safe artifact-candidate projection', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          artifactKind: 'plan_issue',
          artifactId: 'artifact-1',
          artifactVersion: 2,
          artifactChecksum: 'b'.repeat(64),
          artifactTitle: 'Issued drawing set 02',
          issuedAt: '2026-08-10T12:00:00.000Z',
          publishedAt: null,
        },
      ],
      error: null,
    });
    const query = useProjectApprovalArtifactCandidates(
      'project-1',
    ) as unknown as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown[]>;
    };

    expect(query.queryKey).toEqual([
      'project-approval-artifact-candidates',
      'project-1',
    ]);
    await expect(query.queryFn()).resolves.toEqual([
      expect.objectContaining({
        artifactKind: 'plan_issue',
        artifactVersion: 2,
        artifactChecksum: 'b'.repeat(64),
        issuedAt: '2026-08-10T12:00:00.000Z',
        publishedAt: null,
      }),
    ]);
    expect(rpc).toHaveBeenCalledWith(
      'get_project_approval_artifact_candidates',
      { p_project_id: 'project-1' },
    );
  });

  it('rejects a candidate without exact immutable identity', () => {
    expect(() =>
      parseProjectApprovalArtifactCandidate({
        artifactKind: 'plan_issue',
        artifactId: 'artifact-1',
        artifactVersion: 2,
        artifactTitle: 'Issued drawing set 02',
        issuedAt: '2026-08-10T12:00:00.000Z',
        publishedAt: null,
      }),
    ).toThrow(
      'Project approval artifact candidate is missing artifactChecksum',
    );
  });

  it('preserves immutable evidence, authority revision, distinct status, and zero deltas', async () => {
    rpc.mockResolvedValue({ data: [REVIEW], error: null });
    const query = useProjectApprovals('project-1') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };

    await expect(query.queryFn()).resolves.toEqual([
      expect.objectContaining({
        artifactChecksum: 'a'.repeat(64),
        artifactVersion: 3,
        lifecycleStatus: 'pending',
        outcome: null,
        authorityRevision: 4,
        costCentsDelta: 0,
        scheduleDaysDelta: 0,
        leadTimeDaysDelta: 0,
      }),
    ]);
    expect(rpc).toHaveBeenCalledWith('get_project_decision_reviews', {
      p_project_id: 'project-1',
    });
  });

  it('never guesses the authority revision when the sanitized projection omits it', () => {
    expect(
      parseProjectApprovalReview({ ...REVIEW, authorityRevision: undefined }),
    ).toEqual(expect.objectContaining({ authorityRevision: null }));
  });

  it('requires the server-projected overdue condition instead of using a client clock', () => {
    expect(() =>
      parseProjectApprovalReview({ ...REVIEW, isOverdue: undefined }),
    ).toThrow('Project approval review is missing isOverdue');
  });
});

describe('project approval authority and lifecycle RPCs', () => {
  it('always assigns authority with an explicit null coapprover', async () => {
    rpc.mockResolvedValue({
      data: {
        projectId: 'project-1',
        decisionLeadId: 'client-1',
        requiredCoapproverId: null,
        revision: 4,
        assignedBy: 'designer-1',
        assignedAt: '2026-08-10T12:00:00.000Z',
        updatedAt: '2026-08-10T12:00:00.000Z',
      },
      error: null,
    });
    const mutation =
      useSetProjectDecisionAuthority() as unknown as MutationConfig<{
        projectId: string;
        decisionLeadId: string;
        expectedRevision: number;
      }>;

    await mutation.mutationFn({
      projectId: 'project-1',
      decisionLeadId: 'client-1',
      expectedRevision: 3,
    });

    expect(rpc).toHaveBeenCalledWith('set_project_decision_authority', {
      p_project_id: 'project-1',
      p_decision_lead_id: 'client-1',
      p_required_coapprover_id: null,
      p_expected_revision: 3,
    });
  });

  it('creates one exact artifact request and preserves all explicit zero deltas', async () => {
    rpc.mockResolvedValue({
      data: { projectId: 'project-1', decisionId: 'decision-1' },
      error: null,
    });
    const mutation =
      useCreateProjectApproval() as unknown as MutationConfig<any>;

    await mutation.mutationFn({
      projectId: 'project-1',
      idempotencyKey: 'create-1',
      payload: {
        title: 'Budget checkpoint',
        question: 'Approve this exact budget checkpoint?',
        dueAt: '2026-09-01T12:00:00.000Z',
        phaseId: 'phase-1',
        artifactKind: 'budget_version',
        artifactId: 'artifact-1',
        costCentsDelta: 0,
        scheduleDaysDelta: 0,
        leadTimeDaysDelta: 0,
      },
    });

    expect(rpc).toHaveBeenCalledWith('create_project_approval_decision', {
      p_project_id: 'project-1',
      p_payload: expect.objectContaining({
        context: null,
        sectionKey: null,
        costCentsDelta: 0,
        scheduleDaysDelta: 0,
        leadTimeDaysDelta: 0,
      }),
      p_idempotency_key: 'create-1',
    });
  });

  it('binds review confirmation to the frozen revision and SHA-256 artifact', async () => {
    rpc.mockResolvedValue({
      data: { projectId: 'project-1', decisionId: 'decision-1' },
      error: null,
    });
    const mutation =
      useConfirmProjectApprovalReview() as unknown as MutationConfig<any>;

    await mutation.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
      authorityRevision: 4,
      artifactChecksum: 'a'.repeat(64),
      idempotencyKey: 'review-1',
    });

    expect(rpc).toHaveBeenCalledWith('confirm_project_decision_review', {
      p_decision_id: 'decision-1',
      p_payload: {
        authorityRevision: 4,
        artifactHash: 'a'.repeat(64),
        reviewMethod: 'portal_clickthrough',
      },
      p_idempotency_key: 'review-1',
    });
  });

  it('publishes through the installed compatibility RPC', async () => {
    rpc.mockResolvedValue({
      data: { status: 'pending', updated_at: 'now' },
      error: null,
    });
    const mutation =
      usePublishProjectApproval() as unknown as MutationConfig<any>;

    await mutation.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
    });

    expect(rpc).toHaveBeenCalledWith('publish_client_decision', {
      p_decision_id: 'decision-1',
    });
  });

  it('responds with CAS and idempotency but never forwards a discussion comment', async () => {
    rpc.mockResolvedValue({
      data: {
        projectId: 'project-1',
        decisionId: 'decision-1',
        outcome: 'changes_requested',
      },
      error: null,
    });
    const mutation =
      useRespondProjectApproval() as unknown as MutationConfig<any>;

    await mutation.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
      outcome: 'changes_requested',
      expectedUpdatedAt: '2026-08-10T12:05:00.000Z',
      idempotencyKey: 'respond-1',
      comment: 'This must remain discussion-only',
    });

    expect(rpc).toHaveBeenCalledWith('respond_project_approval', {
      p_decision_id: 'decision-1',
      p_payload: { outcome: 'changes_requested' },
      p_expected_updated_at: '2026-08-10T12:05:00.000Z',
      p_idempotency_key: 'respond-1',
    });
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain('comment');
  });

  it('uses the exact withdrawal and supersession signatures', async () => {
    rpc.mockResolvedValue({
      data: { projectId: 'project-1', decisionId: 'decision-1' },
      error: null,
    });
    const withdraw =
      useWithdrawProjectApproval() as unknown as MutationConfig<any>;
    await withdraw.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
      expectedUpdatedAt: '2026-08-10T12:05:00.000Z',
      reason: 'Replaced by a new issued set',
      idempotencyKey: 'withdraw-1',
    });
    expect(rpc).toHaveBeenLastCalledWith('withdraw_project_approval_decision', {
      p_decision_id: 'decision-1',
      p_expected_updated_at: '2026-08-10T12:05:00.000Z',
      p_reason: 'Replaced by a new issued set',
      p_idempotency_key: 'withdraw-1',
    });

    const supersede =
      useSupersedeProjectApproval() as unknown as MutationConfig<any>;
    await supersede.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
      expectedUpdatedAt: '2026-08-10T12:05:00.000Z',
      idempotencyKey: 'supersede-1',
      payload: {
        title: 'Budget checkpoint 04',
        question: 'Approve revision 04?',
        dueAt: '2026-09-05T12:00:00.000Z',
        artifactKind: 'budget_version',
        artifactId: 'artifact-2',
        costCentsDelta: 500,
        scheduleDaysDelta: 1,
        leadTimeDaysDelta: 2,
      },
    });
    expect(rpc).toHaveBeenLastCalledWith(
      'supersede_project_approval_decision',
      {
        p_decision_id: 'decision-1',
        p_payload: expect.objectContaining({ artifactId: 'artifact-2' }),
        p_expected_updated_at: '2026-08-10T12:05:00.000Z',
        p_idempotency_key: 'supersede-1',
      },
    );
  });
});

describe('project approval cache and realtime authority', () => {
  it('invalidates every Stage-2 consumer through one project-scoped helper', async () => {
    await invalidateProjectApprovalQueries({ invalidateQueries } as any, {
      projectId: 'project-1',
      decisionId: 'decision-1',
      designerClientId: 'relationship-1',
    });
    const keys = invalidateQueries.mock.calls.map(
      (call) =>
        (call as unknown as [{ queryKey: readonly unknown[] }])[0].queryKey,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        ['project-approvals', 'project-1'],
        ['project-approval-authority', 'project-1'],
        ['project-approval-artifact-candidates', 'project-1'],
        ['project-approval', 'decision-1'],
        ['my-project-approval-reviews'],
        ['project-contextual-handoffs', 'project-1'],
        ['client-decision', 'decision-1'],
        ['project-decisions', 'project-1'],
        ['client-decisions', 'relationship-1'],
        ['all-decisions'],
        ['decision-metrics'],
        ['section-gates', 'project-1'],
        ['project-workflow', 'project-1'],
        ['project-ffe-items', 'project-1'],
      ]),
    );
  });

  it('uses one project channel for projection owners and cleans it up deterministically', () => {
    useProjectApprovalRealtime('project-1');

    expect(channelSubscribe).toHaveBeenCalledTimes(1);
    expect(channelOn.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({
        table: 'client_decisions',
        filter: 'project_id=eq.project-1',
      }),
      expect.objectContaining({
        table: 'project_approval_artifacts',
        filter: 'project_id=eq.project-1',
      }),
      expect.objectContaining({
        table: 'project_decision_review_confirmations',
        filter: 'project_id=eq.project-1',
      }),
      expect.objectContaining({
        table: 'project_approval_action_receipts',
        filter: 'project_id=eq.project-1',
      }),
    ]);

    const invalidate = channelOn.mock.calls[0][2] as () => void;
    invalidate();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-approvals', 'project-1'],
    });

    effectCleanup?.();
    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});
