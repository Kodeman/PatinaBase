import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const from = vi.fn();
const rpc = vi.fn();
const invalidateQueries = vi.fn();
const channelOn = vi.fn();
const channelSubscribe = vi.fn();
const removeChannel = vi.fn();
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
    from,
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
  excludeProjectArtifactApprovals,
  useCreateCoordinationItem,
  useDeleteCoordinationItem,
  useExtendCoordinationItem,
  useNudgeCoordinationItem,
  usePublishCoordinationItem,
  useReassignCoordinationItem,
  useRecordPartySmsConsent,
  useResolveCoordinationItem,
  useCoordinationRealtime,
  useSubmitCoordinationRevision,
  useUpdateCoordinationItem,
  type SubmitCoordinationRevisionInput,
} from '../use-coordination';

const coordinationItem = {
  id: 'coord-1',
  project_id: 'proj-1',
  designer_client_id: 'dc-1',
};

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: coordinationItem, error: null });
  invalidateQueries.mockReset();
  channelOn.mockReset();
  channelSubscribe.mockReset();
  removeChannel.mockReset();
  effectCleanup = undefined;
});

describe('coordination authority routing', () => {
  it('keeps Stage-2 approvals out of generic coordination presentation without deleting legacy reads', () => {
    const legacy = { id: 'legacy', approval_contract: null };
    const stage2 = {
      id: 'stage-2',
      approval_contract: 'project_artifact_v1',
    };

    expect(excludeProjectArtifactApprovals([legacy, stage2] as any)).toEqual([
      legacy,
    ]);
  });

  it('invalidates the project workflow after a blocker mutation', () => {
    const config = useCreateCoordinationItem('proj-1') as unknown as {
      onSuccess: (data: typeof coordinationItem) => void;
    };

    config.onSuccess(coordinationItem);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-workflow', 'proj-1'],
    });
  });

  it('shares one realtime channel across decisions, tasks, and FF&E with deterministic cleanup', () => {
    useCoordinationRealtime('proj-1');

    expect(channelSubscribe).toHaveBeenCalledTimes(1);
    expect(channelOn.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ table: 'client_decisions' }),
      expect.objectContaining({ table: 'project_tasks' }),
      expect.objectContaining({ table: 'project_ffe_items' }),
    ]);

    const invalidate = channelOn.mock.calls[0][2] as () => void;
    invalidate();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-workflow', 'proj-1'],
    });

    effectCleanup?.();
    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it('never forwards caller-supplied resolution attribution or a separate notice', async () => {
    const config = useResolveCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      itemId: 'coord-1',
      answer: 'Approved',
      resolvedBy: 'spoofed-user',
    });

    expect(rpc).toHaveBeenCalledWith('resolve_coordination_item', {
      p_item_id: 'coord-1',
      p_selected_option_id: null,
      p_answer: 'Approved',
      p_revision_id: null,
      p_next_court: null,
      p_resolved_by: null,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('creates the item, options, dependency web, and first notice atomically', async () => {
    const config = useCreateCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      itemId: 'coord-1',
      designerClientId: 'dc-1',
      projectId: 'proj-1',
      title: 'Final selection',
      coordinationKind: 'selection',
      court: 'client',
      options: [{ name: 'Walnut', productId: 'prod-1' }],
      blockedFfeItemIds: ['ffe-1'],
      blockedTaskIds: ['task-1'],
    });

    expect(rpc).toHaveBeenCalledWith('create_client_decision', {
      p_decision_id: 'coord-1',
      p_payload: expect.objectContaining({
        designer_client_id: 'dc-1',
        project_id: 'proj-1',
        title: 'Final selection',
        coordination_kind: 'selection',
        court: 'client',
        status: 'pending',
      }),
      p_options: [
        expect.objectContaining({
          name: 'Walnut',
          product_id: 'prod-1',
          sort_order: 0,
        }),
      ],
      p_blocked_ffe_item_ids: ['ffe-1'],
      p_blocked_task_ids: ['task-1'],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('surfaces an atomic create failure without partial child writes', async () => {
    const createError = { code: '23514', message: 'dependency mismatch' };
    rpc.mockResolvedValueOnce({ data: null, error: createError });
    const config = useCreateCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({
        itemId: 'coord-1',
        designerClientId: 'dc-1',
        title: 'Blocked item',
        coordinationKind: 'rfi',
        court: 'gc',
      }),
    ).rejects.toBe(createError);
    expect(from).not.toHaveBeenCalled();
  });

  it('routes reminder and publish through their notification-owning lifecycle RPCs', async () => {
    const nudge = useNudgeCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    const publish = usePublishCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await nudge.mutationFn({ itemId: 'coord-1' });
    await publish.mutationFn({ itemId: 'coord-1' });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'stamp_client_decision_reminder',
      'publish_client_decision',
    ]);
  });

  it('updates the item, options, and dependencies through one CAS RPC', async () => {
    const config = useUpdateCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      itemId: 'coord-1',
      expectedUpdatedAt: '2026-08-01T12:00:00Z',
      designerClientId: 'dc-1',
      projectId: 'proj-1',
      title: 'Final selection',
      options: [{ name: 'Walnut', productId: 'prod-1' }],
      blockedFfeItemIds: [],
      blockedTaskIds: ['task-1'],
    });

    expect(rpc).toHaveBeenCalledWith('update_coordination_item', {
      p_item_id: 'coord-1',
      p_patch: { title: 'Final selection' },
      p_options: [
        expect.objectContaining({
          name: 'Walnut',
          product_id: 'prod-1',
          sort_order: 0,
        }),
      ],
      p_blocked_ffe_item_ids: [],
      p_blocked_task_ids: ['task-1'],
      p_expected_updated_at: '2026-08-01T12:00:00Z',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('passes non-null CAS tokens through extend and reassign', async () => {
    const extend = useExtendCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    const reassign = useReassignCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await extend.mutationFn({
      itemId: 'coord-1',
      dueDate: '2026-08-15',
      expectedUpdatedAt: '2026-08-01T12:00:00Z',
    });
    await reassign.mutationFn({
      itemId: 'coord-1',
      court: 'vendor',
      courtPartyId: 'party-1',
      expectedUpdatedAt: '2026-08-02T12:00:00Z',
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'update_client_decision', {
      p_decision_id: 'coord-1',
      p_patch: { due_date: '2026-08-15' },
      p_options: null,
      p_expected_updated_at: '2026-08-01T12:00:00Z',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'update_client_decision', {
      p_decision_id: 'coord-1',
      p_patch: { court: 'vendor', court_party_id: 'party-1' },
      p_options: null,
      p_expected_updated_at: '2026-08-02T12:00:00Z',
    });
  });

  it('narrows revision submission to the two pending-workflow statuses', async () => {
    expectTypeOf<SubmitCoordinationRevisionInput['status']>().toEqualTypeOf<
      'submitted' | 'revise_resubmit' | undefined
    >();
    const config = useSubmitCoordinationRevision('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      itemId: 'coord-1',
      status: 'revise_resubmit',
      note: 'Tighten the reveal',
    });
    expect(rpc).toHaveBeenCalledWith('submit_coordination_revision', {
      p_item_id: 'coord-1',
      p_attachments: [],
      p_note: 'Tighten the reveal',
      p_status: 'revise_resubmit',
      p_submitted_by: null,
    });
  });

  it('deletes through the checked cleanup RPC', async () => {
    const config = useDeleteCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      itemId: 'coord-1',
      designerClientId: 'dc-1',
    });

    expect(rpc).toHaveBeenCalledWith('delete_client_decision_draft', {
      p_decision_id: 'coord-1',
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('useRecordPartySmsConsent — the only writer of consent columns on an existing party', () => {
  /** Chains `.update(payload).eq('id', …).eq('sms_consent_status', 'not_asked').select().single()`
   *  and captures the update payload for inspection — the DB write IS the
   *  contract fc_dispatch_optin_invite (00432) reads. */
  function mockUpdateChain(result: { data: unknown; error: unknown }) {
    const single = vi.fn().mockResolvedValue(result);
    const select = vi.fn(() => ({ single }));
    const eq2 = vi.fn(() => ({ select }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: eq1 }));
    from.mockReturnValue({ update });
    return { update, eq1, eq2, select, single };
  }

  it('writes exactly the five not_asked→pending consent columns fc_dispatch_optin_invite expects, guarded to the not_asked row only', async () => {
    const { update, eq1, eq2 } = mockUpdateChain({
      data: { id: 'party-1', project_id: 'proj-1' },
      error: null,
    });
    const config = useRecordPartySmsConsent() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      partyId: 'party-1',
      projectId: 'proj-1',
      phone: '5551234567',
      smsConsentSource: 'verbal',
      smsConsentEvidence: 'Told me at the site kickoff on Aug 8',
    });

    expect(from).toHaveBeenCalledWith('project_parties');
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      [
        'sms_consent_disclosure_version',
        'sms_consent_evidence',
        'sms_consent_recorded_at',
        'sms_consent_source',
        'sms_consent_status',
      ].sort(),
    );
    expect(payload).toEqual({
      sms_consent_status: 'pending',
      sms_consent_source: 'verbal',
      sms_consent_evidence: 'Told me at the site kickoff on Aug 8',
      sms_consent_recorded_at: expect.any(String),
      sms_consent_disclosure_version: 'field-sms-v1',
    });
    // Only the not_asked → pending transition is legal from this UI.
    expect(eq1).toHaveBeenCalledWith('id', 'party-1');
    expect(eq2).toHaveBeenCalledWith('sms_consent_status', 'not_asked');
  });

  it('refuses to write without a phone, mirroring useAddProjectParty\'s wantsText guard', async () => {
    mockUpdateChain({ data: null, error: null });
    const config = useRecordPartySmsConsent() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({
        partyId: 'party-1',
        projectId: 'proj-1',
        phone: '',
        smsConsentSource: 'verbal',
        smsConsentEvidence: 'Told me at kickoff',
      }),
    ).rejects.toThrow(/phone number/i);
    expect(from).not.toHaveBeenCalled();
  });

  it('refuses to write without non-blank evidence', async () => {
    mockUpdateChain({ data: null, error: null });
    const config = useRecordPartySmsConsent() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({
        partyId: 'party-1',
        projectId: 'proj-1',
        phone: '5551234567',
        smsConsentSource: 'verbal',
        smsConsentEvidence: '   ',
      }),
    ).rejects.toThrow(/prior consent/i);
    expect(from).not.toHaveBeenCalled();
  });
});
