import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invalidateQueries = vi.fn(() => Promise.resolve());
const channelOn = vi.fn();
const channelSubscribe = vi.fn();
const removeChannel = vi.fn(() => Promise.resolve());
const channelCreate = vi.fn();
const channel: Record<string, unknown> = {};
channel.on = (...args: unknown[]) => {
  channelOn(...args);
  return channel;
};
channel.subscribe = () => {
  channelSubscribe();
  return channel;
};
channelCreate.mockReturnValue(channel);

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    rpc,
    channel: channelCreate,
    removeChannel,
  }),
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
  useProjectApprovalByDecision,
  useProjectApprovalArtifactCandidates,
  useProjectApprovals,
  useProjectDecisionAuthority,
  useMyProjectApprovalReviews,
  usePublishProjectApproval,
  useRespondProjectApproval,
  useSetDecisionSnooze,
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
  why: 'The stone slab we chose is no longer quarried.',
  whyAuthorName: 'Leah Quist',
  viewerRole: 'lead',
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
  channelCreate.mockClear();
  removeChannel.mockReset();
  removeChannel.mockResolvedValue(undefined);
});

describe('project approval sanitized reads', () => {
  it('refreshes every approval read model only while foregrounded', () => {
    const queries = [
      useProjectApprovals('project-1'),
      useProjectApprovalByDecision('decision-1'),
      useMyProjectApprovalReviews(),
      useProjectDecisionAuthority('project-1'),
      useProjectApprovalArtifactCandidates('project-1'),
    ] as unknown as Array<Record<string, unknown>>;

    for (const query of queries) {
      expect(query).toEqual(
        expect.objectContaining({
          refetchOnWindowFocus: true,
          refetchInterval: 30_000,
          refetchIntervalInBackground: false,
        }),
      );
    }
  });

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

  it('reads the frozen why, and stays null on an artifact minted before the column', () => {
    expect(
      parseProjectApprovalReview({
        ...REVIEW,
        why: 'The walnut is the only piece that holds the room.',
      }),
    ).toEqual(
      expect.objectContaining({
        why: 'The walnut is the only piece that holds the room.',
      }),
    );
    expect(parseProjectApprovalReview({ ...REVIEW, why: undefined })).toEqual(
      expect.objectContaining({ why: null }),
    );
  });

  it("reads the why's author, and stays null until the projection carries one", () => {
    expect(
      parseProjectApprovalReview({ ...REVIEW, whyAuthorName: 'Leah Kochaver' }),
    ).toEqual(expect.objectContaining({ whyAuthorName: 'Leah Kochaver' }));
    expect(
      parseProjectApprovalReview({ ...REVIEW, whyAuthorName: undefined }),
    ).toEqual(expect.objectContaining({ whyAuthorName: null }));
  });

  it('requires the server-projected overdue condition instead of using a client clock', () => {
    expect(() =>
      parseProjectApprovalReview({ ...REVIEW, isOverdue: undefined }),
    ).toThrow('Project approval review is missing isOverdue');
  });

  it('carries the frozen why, its author and the viewer’s chair to the surface', () => {
    expect(parseProjectApprovalReview(REVIEW)).toEqual(
      expect.objectContaining({
        why: 'The stone slab we chose is no longer quarried.',
        // The why is signed by the hand that WROTE it, frozen with the
        // artifact — a studio has more than one designer and the record is
        // immutable and client-facing (ruling, 2026-09-05).
        whyAuthorName: 'Leah Quist',
        viewerRole: 'lead',
      }),
    );
  });

  it.each(['lead', 'studio', 'household'])(
    'keeps the %s chair exactly as the projection stated it',
    (viewerRole) => {
      expect(parseProjectApprovalReview({ ...REVIEW, viewerRole })).toEqual(
        expect.objectContaining({ viewerRole }),
      );
    },
  );

  it('reads a why and a chair as absent rather than throwing a pre-00569 row away', () => {
    expect(
      parseProjectApprovalReview({
        ...REVIEW,
        why: undefined,
        whyAuthorName: undefined,
        viewerRole: undefined,
      }),
    ).toEqual(
      expect.objectContaining({ why: null, whyAuthorName: null, viewerRole: null }),
    );
  });

  // An unsigned sentence is honest; a wrongly signed one is not. The parser
  // never substitutes another name for an author it was not given.
  it('leaves the why unsigned when the projection names no author', () => {
    expect(
      parseProjectApprovalReview({ ...REVIEW, whyAuthorName: null }),
    ).toEqual(expect.objectContaining({ whyAuthorName: null }));
  });

  it('never guesses a chair from a role it does not recognise', () => {
    expect(
      parseProjectApprovalReview({ ...REVIEW, viewerRole: 'owner' }),
    ).toEqual(expect.objectContaining({ viewerRole: null }));
  });

  // P-26 (00573). The typed name is what puts her signature on the printed
  // Record of Decision; Return and Hold carry none, and neither does any
  // projection older than 00573.
  it('carries the typed name when the projection has one, and null when it has not', () => {
    expect(
      parseProjectApprovalReview({ ...REVIEW, clientSignature: 'Leah Quist' }),
    ).toEqual(expect.objectContaining({ clientSignature: 'Leah Quist' }));
    expect(
      parseProjectApprovalReview({ ...REVIEW, clientSignature: null }),
    ).toEqual(expect.objectContaining({ clientSignature: null }));
    expect(parseProjectApprovalReview({ ...REVIEW })).toEqual(
      expect.objectContaining({ clientSignature: null }),
    );
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

  it('carries the composer why to the RPC as p_why', async () => {
    rpc.mockResolvedValue({
      data: { projectId: 'project-1', decisionId: 'decision-1' },
      error: null,
    });
    const mutation =
      useCreateProjectApproval() as unknown as MutationConfig<any>;

    await mutation.mutationFn({
      projectId: 'project-1',
      idempotencyKey: 'create-why',
      payload: {
        title: 'Budget checkpoint',
        question: 'Approve this exact budget checkpoint?',
        why: '  The walnut is the only piece that holds the room.  ',
        dueAt: '2026-09-01T12:00:00.000Z',
        phaseId: 'phase-1',
        artifactKind: 'budget_version',
        artifactId: 'artifact-1',
        costCentsDelta: 0,
        scheduleDaysDelta: 0,
        leadTimeDaysDelta: 0,
      },
    });

    expect(rpc).toHaveBeenCalledWith(
      'create_project_approval_decision',
      expect.objectContaining({
        p_why: 'The walnut is the only piece that holds the room.',
      }),
    );
  });

  it('omits p_why entirely when no why was written, so the old signature still takes the call', async () => {
    rpc.mockResolvedValue({
      data: { projectId: 'project-1', decisionId: 'decision-1' },
      error: null,
    });
    const mutation =
      useCreateProjectApproval() as unknown as MutationConfig<any>;

    for (const why of [undefined, null, '   ']) {
      rpc.mockClear();
      await mutation.mutationFn({
        projectId: 'project-1',
        idempotencyKey: 'create-no-why',
        payload: {
          title: 'Budget checkpoint',
          question: 'Approve this exact budget checkpoint?',
          why,
          dueAt: '2026-09-01T12:00:00.000Z',
          phaseId: 'phase-1',
          artifactKind: 'budget_version',
          artifactId: 'artifact-1',
          costCentsDelta: 0,
          scheduleDaysDelta: 0,
          leadTimeDaysDelta: 0,
        },
      });

      expect(Object.keys(rpc.mock.calls[0][1])).not.toContain('p_why');
    }
  });

  it('sends p_why as one line, whatever whitespace the payload arrived with', async () => {
    rpc.mockResolvedValue({
      data: { projectId: 'project-1', decisionId: 'decision-1' },
      error: null,
    });
    const mutation =
      useCreateProjectApproval() as unknown as MutationConfig<any>;

    await mutation.mutationFn({
      projectId: 'project-1',
      idempotencyKey: 'create-why-newline',
      payload: {
        title: 'Budget checkpoint',
        question: 'Approve this exact budget checkpoint?',
        why: '\n The walnut is the only piece\r\n\tthat holds the room. \n',
        dueAt: '2026-09-01T12:00:00.000Z',
        phaseId: 'phase-1',
        artifactKind: 'budget_version',
        artifactId: 'artifact-1',
        costCentsDelta: 0,
        scheduleDaysDelta: 0,
        leadTimeDaysDelta: 0,
      },
    });

    const sent = rpc.mock.calls[0][1].p_why as string;
    expect(sent).toBe('The walnut is the only piece that holds the room.');
    expect(sent).not.toMatch(/[\r\n]/u);
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

  it('carries the typed name and its consent method when one is given (P-18)', async () => {
    rpc.mockResolvedValue({
      data: {
        projectId: 'project-1',
        decisionId: 'decision-1',
        outcome: 'approved',
      },
      error: null,
    });
    const mutation =
      useRespondProjectApproval() as unknown as MutationConfig<any>;

    await mutation.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
      outcome: 'approved',
      expectedUpdatedAt: '2026-08-10T12:05:00.000Z',
      idempotencyKey: 'respond-2',
      clientSignature: 'Harper Vale',
      clientConsentMethod: 'electronic_signature',
    });

    expect(rpc).toHaveBeenCalledWith('respond_project_approval', {
      p_decision_id: 'decision-1',
      p_payload: {
        outcome: 'approved',
        clientConsentMethod: 'electronic_signature',
        clientSignature: 'Harper Vale',
      },
      p_expected_updated_at: '2026-08-10T12:05:00.000Z',
      p_idempotency_key: 'respond-2',
    });
  });

  it('sends neither key without a consent method, so a pre-00570 wrapper still answers', async () => {
    rpc.mockResolvedValue({
      data: { projectId: 'project-1', decisionId: 'decision-1' },
      error: null,
    });
    const mutation =
      useRespondProjectApproval() as unknown as MutationConfig<any>;

    // A signature with no method is a check_violation in the RPC, and the two
    // extra keys are refused outright by any wrapper minted before 00570 — so
    // the method is what decides whether either travels.
    await mutation.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
      outcome: 'needs_discussion',
      expectedUpdatedAt: '2026-08-10T12:05:00.000Z',
      idempotencyKey: 'respond-3',
      clientSignature: 'Harper Vale',
    });

    expect(rpc.mock.calls[0][1].p_payload).toEqual({ outcome: 'needs_discussion' });
  });

  /* ── P-28 · she sets the pace, per approval ───────────────────────────── */

  /**
   * The RPC 00572 declares is `set_decision_snooze(p_decision_id uuid, p_kind
   * text)`. PostgREST resolves overloads by argument NAME, so a hook that
   * posts `p_choice` — or a third `p_timezone` — resolves nothing and every
   * press comes back PGRST202. The zone is resolved server-side
   * (`notification_time_zone`), which is why the browser sends none.
   */
  it('calls the RPC by the signature 00572 declares — p_decision_id and p_kind, nothing else', async () => {
    rpc.mockResolvedValue({
      data: {
        decisionId: 'decision-1',
        kind: 'sunday',
        snoozedUntil: '2026-09-13T13:00:00.000Z',
        timeZone: 'America/Chicago',
      },
      error: null,
    });
    const snooze = useSetDecisionSnooze() as unknown as MutationConfig<any>;

    await snooze.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
      choice: 'sunday',
    });

    expect(rpc).toHaveBeenCalledWith('set_decision_snooze', {
      p_decision_id: 'decision-1',
      p_kind: 'sunday',
    });
    expect(Object.keys(rpc.mock.calls[0][1])).toEqual(['p_decision_id', 'p_kind']);
  });

  /**
   * The four kinds the RPC's own IN list accepts. `never` is the fourth —
   * "don't remind me" — and any other spelling raises
   * `unsupported snooze kind` at the database.
   */
  it('spells every kind the way the RPC accepts it', async () => {
    for (const kind of ['tomorrow_morning', 'sunday', 'when_due', 'never'] as const) {
      rpc.mockResolvedValue({ data: { decisionId: 'decision-1', kind }, error: null });
      const snooze = useSetDecisionSnooze() as unknown as MutationConfig<any>;
      await snooze.mutationFn({
        projectId: 'project-1',
        decisionId: 'decision-1',
        choice: kind,
      });
      expect(rpc.mock.calls.at(-1)?.[1].p_kind).toBe(kind);
    }
  });

  /**
   * The snooze RPC answers about the SNOOZE and returns no projectId. Demanding
   * one would throw on a call that had already stood the reminders down, and
   * the surface would tell her the reminders could not be set when they had.
   */
  it('accepts a return that carries no projectId, and takes the caller\'s own', async () => {
    rpc.mockResolvedValue({
      data: {
        decisionId: 'decision-1',
        kind: 'never',
        snoozedUntil: null,
        timeZone: 'America/Chicago',
      },
      error: null,
    });
    const snooze = useSetDecisionSnooze() as unknown as MutationConfig<any>;

    const result = (await snooze.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
      choice: 'never',
    })) as { projectId: string; decisionId: string };

    expect(result.projectId).toBe('project-1');
    expect(result.decisionId).toBe('decision-1');
  });

  it('rides the approval invalidation rail, so the ask redraws with its snooze', async () => {
    rpc.mockResolvedValue({
      data: { decisionId: 'decision-1', kind: 'when_due' },
      error: null,
    });
    const snooze = useSetDecisionSnooze() as unknown as MutationConfig<any>;
    const result = await snooze.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
      choice: 'when_due',
    });

    invalidateQueries.mockClear();
    await snooze.onSuccess?.(result, {
      projectId: 'project-1',
      decisionId: 'decision-1',
      choice: 'when_due',
    });

    const keys = (
      invalidateQueries.mock.calls as unknown as Array<[{ queryKey: unknown }]>
    ).map(([call]) => JSON.stringify(call.queryKey));
    expect(keys).toContain(JSON.stringify(['project-approvals', 'project-1']));
    expect(keys).toContain(JSON.stringify(['my-project-approval-reviews']));
    expect(keys).toContain(JSON.stringify(['project-approval', 'decision-1']));
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

  it('carries a re-asked why to the supersede RPC as one line, and omits the key when none was re-asked', async () => {
    rpc.mockResolvedValue({
      data: { projectId: 'project-1', decisionId: 'decision-2' },
      error: null,
    });
    const supersede =
      useSupersedeProjectApproval() as unknown as MutationConfig<any>;
    const basePayload = {
      title: 'Budget checkpoint 04',
      question: 'Approve revision 04?',
      dueAt: '2026-09-05T12:00:00.000Z',
      artifactKind: 'budget_version' as const,
      artifactId: 'artifact-2',
      costCentsDelta: 0,
      scheduleDaysDelta: 0,
      leadTimeDaysDelta: 0,
    };

    await supersede.mutationFn({
      projectId: 'project-1',
      decisionId: 'decision-1',
      expectedUpdatedAt: '2026-08-10T12:05:00.000Z',
      idempotencyKey: 'supersede-why',
      payload: {
        ...basePayload,
        why: ' The walnut\nstill holds the room. ',
      },
    });
    const sent = rpc.mock.calls[0][1].p_why as string;
    expect(sent).toBe('The walnut still holds the room.');
    expect(sent).not.toMatch(/[\r\n]/u);

    // Silence is not a clearing: the RPC carries the predecessor's frozen why
    // forward when the key is absent.
    for (const why of [undefined, null, '  ']) {
      rpc.mockClear();
      await supersede.mutationFn({
        projectId: 'project-1',
        decisionId: 'decision-1',
        expectedUpdatedAt: '2026-08-10T12:05:00.000Z',
        idempotencyKey: 'supersede-no-why',
        payload: { ...basePayload, why },
      });
      expect(Object.keys(rpc.mock.calls[0][1])).not.toContain('p_why');
    }
  });
});

describe('project approval cache and compatibility', () => {
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
});
