import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const from = vi.fn();
const rpc = vi.fn();
const getUser = vi.fn();
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
    auth: { getUser },
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
  useAddProjectParty,
  useCreateCoordinationItem,
  useDeleteCoordinationItem,
  useExtendCoordinationItem,
  useNudgeCoordinationItem,
  usePublishCoordinationItem,
  useReassignCoordinationItem,
  useRecordPartySmsConsent,
  useResolveCoordinationItem,
  useUpdateProjectParty,
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
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: 'designer-1' } }, error: null });
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

describe('useRecordPartySmsConsent — R-AS: the record, and no seat column at all', () => {
  const PARTY_ID = 'party-1';
  const PROJECT_ID = 'proj-1';
  const ORG_ID = 'org-beta';
  const PHONE = '5551234567';

  function config() {
    return useRecordPartySmsConsent() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
  }

  const input = {
    partyId: PARTY_ID,
    projectId: PROJECT_ID,
    phone: PHONE,
    smsConsentSource: 'verbal' as const,
    smsConsentEvidence: 'Told me at the site kickoff',
  };

  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
  });

  it('records the invite on the studio ledger and touches project_parties not at all', async () => {
    // The whole point of R-AS. The old body flipped six frozen columns on the
    // seat; the freeze trigger refuses every one of them, so the act failed
    // loudly and the studio saw a Postgres string. Now the fact goes where the
    // send gate and both readers already look.
    rpc
      .mockResolvedValueOnce({ data: ORG_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await config().mutationFn(input);

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual([
      'project_consent_org',
      { p_project_id: PROJECT_ID },
    ]);
    expect(rpc.mock.calls[1][0]).toBe('record_channel_invite');
    expect(rpc.mock.calls[1][1]).toEqual({
      p_organization_id: ORG_ID,
      p_channel_kind: 'sms',
      p_channel_value: PHONE,
      p_source: 'verbal',
      p_evidence: 'Told me at the site kickoff',
      p_disclosure_version: 'field-sms-v1',
      p_origin_project_id: PROJECT_ID,
    });
  });

  it('calls the door that cannot lower a standing grant, and never names a status', async () => {
    // close-review r2 MAJOR-1: `record_channel_consent(…, 'pending', …)` would
    // demote a repeat sub's evidenced grant every time they were invited again.
    rpc
      .mockResolvedValueOnce({ data: ORG_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await config().mutationFn(input);

    const [name, args] = rpc.mock.calls[1] as [string, Record<string, unknown>];
    expect(name).toBe('record_channel_invite');
    expect(args).not.toHaveProperty('p_status');
  });

  it('runs no sibling probe and no transition pin — the RPC owns both gates', async () => {
    // The three seat-shaped guards the old body carried (a phone-global
    // opted_out probe, a `.eq('sms_consent_status','not_asked')` pin, and a
    // revert when phone_e164 failed to normalize) all asked questions of a
    // frozen copy. 00594's own gates ask them of the ledger, before anything
    // is written or sent.
    rpc
      .mockResolvedValueOnce({ data: ORG_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await config().mutationFn(input);

    expect(from).not.toHaveBeenCalled();
  });

  it('refuses before the RPC when the project has no studio to record against', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(config().mutationFn(input)).rejects.toThrow(/isn't attached to a studio/i);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("turns the RPC's channel_opted_out into a sentence", async () => {
    rpc
      .mockResolvedValueOnce({ data: ORG_ID, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'channel_opted_out', code: 'P0001' },
      });

    await expect(config().mutationFn(input)).rejects.toThrow(/already opted out/i);
  });

  it('turns an un-textable number into a sentence, where the old body reverted a stranded seat', async () => {
    rpc
      .mockResolvedValueOnce({ data: ORG_ID, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'invalid_channel_value', code: 'P0001' },
      });

    await expect(config().mutationFn(input)).rejects.toThrow(/can't receive texts/i);
  });

  it("refuses to write without a phone, mirroring useAddProjectParty's wantsText guard", async () => {
    await expect(config().mutationFn({ ...input, phone: '  ' })).rejects.toThrow(
      /needs a phone number/i,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses to write without non-blank evidence', async () => {
    await expect(
      config().mutationFn({ ...input, smsConsentEvidence: '   ' }),
    ).rejects.toThrow(/how and where/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('useAddProjectParty — the invite goes on the record, and ONLY on the record (R-AS)', () => {
  const PROJECT_ID = 'proj-1';
  const ORG_ID = 'org-beta';

  function insertBuilder(result: { data: unknown; error: unknown }) {
    const single = vi.fn().mockResolvedValue(result);
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn((_payload: Record<string, unknown>) => ({ select }));
    return { insert, select, single };
  }

  function config() {
    return useAddProjectParty() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
  }

  const textableInput = {
    projectId: PROJECT_ID,
    partyKind: 'sub' as const,
    displayName: 'Ray Thao',
    phone: '(612) 555-9001',
    textUpdates: true,
    smsConsentSource: 'verbal' as const,
    smsConsentEvidence: 'Told me at the site kickoff',
  };

  /** The eight columns 00594 froze. Not one of them may appear in an INSERT
   *  payload any more, whichever way the designer ticked the box. */
  const FROZEN_COLUMNS = [
    'sms_consent_status',
    'sms_consent_source',
    'sms_consent_evidence',
    'sms_consent_recorded_at',
    'sms_consent_recorded_by',
    'sms_consent_disclosure_version',
    'sms_consented_at',
    'sms_opt_out_at',
  ];

  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
  });

  it('records the invite on the studio record BEFORE the seat is born', async () => {
    const ins = insertBuilder({ data: { id: 'party-9', project_id: PROJECT_ID }, error: null });
    from.mockReturnValue({ insert: ins.insert });
    rpc
      .mockResolvedValueOnce({ data: ORG_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await config().mutationFn(textableInput);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual([
      'project_consent_org',
      { p_project_id: PROJECT_ID },
    ]);
    expect(rpc.mock.calls[1][0]).toBe('record_channel_invite');
    expect(rpc.mock.calls[1][1]).toEqual({
      p_organization_id: ORG_ID,
      p_channel_kind: 'sms',
      p_channel_value: '(612) 555-9001',
      p_source: 'verbal',
      p_evidence: 'Told me at the site kickoff',
      p_disclosure_version: 'field-sms-v1',
      p_origin_project_id: PROJECT_ID,
    });
  });

  it('writes NO frozen consent column on the seat, even when the designer ticked text updates', async () => {
    const ins = insertBuilder({ data: { id: 'party-9', project_id: PROJECT_ID }, error: null });
    from.mockReturnValue({ insert: ins.insert });
    rpc
      .mockResolvedValueOnce({ data: ORG_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await config().mutationFn(textableInput);

    const seat = ins.insert.mock.calls[0][0] as Record<string, unknown>;
    for (const column of FROZEN_COLUMNS) expect(seat).not.toHaveProperty(column);
  });

  it('writes no frozen column and no record when the designer did not tick text updates', async () => {
    const ins = insertBuilder({ data: { id: 'party-9', project_id: PROJECT_ID }, error: null });
    from.mockReturnValue({ insert: ins.insert });

    await config().mutationFn({ ...textableInput, textUpdates: false });

    expect(rpc).not.toHaveBeenCalled();
    const seat = ins.insert.mock.calls[0][0] as Record<string, unknown>;
    for (const column of FROZEN_COLUMNS) expect(seat).not.toHaveProperty(column);
  });

  it('calls the door that cannot lower a standing grant', async () => {
    const ins = insertBuilder({ data: { id: 'party-9', project_id: PROJECT_ID }, error: null });
    from.mockReturnValue({ insert: ins.insert });
    rpc
      .mockResolvedValueOnce({ data: ORG_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await config().mutationFn(textableInput);

    const [name, args] = rpc.mock.calls[1] as [string, Record<string, unknown>];
    expect(name).toBe('record_channel_invite');
    expect(args).not.toHaveProperty('p_status');
  });

  it('refuses before the seat exists when the project has no studio to record against', async () => {
    const ins = insertBuilder({ data: null, error: null });
    from.mockReturnValue({ insert: ins.insert });
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(config().mutationFn(textableInput)).rejects.toThrow(/isn't attached to a studio/i);
    expect(ins.insert).not.toHaveBeenCalled();
  });

  it("turns the RPC's channel_opted_out into a sentence, and never writes the seat", async () => {
    const ins = insertBuilder({ data: null, error: null });
    from.mockReturnValue({ insert: ins.insert });
    rpc
      .mockResolvedValueOnce({ data: ORG_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'channel_opted_out', code: 'P0001' } });

    await expect(config().mutationFn(textableInput)).rejects.toThrow(/already opted out/i);
    expect(ins.insert).not.toHaveBeenCalled();
  });
});

describe('the frozen columns still speak English if the database ever refuses', () => {
  // Nothing in the portal names a frozen column any more, so
  // `refuse_legacy_consent_write_trg` cannot fire from here. 00594's OTHER
  // trigger still can: `consent_opted_out_phone_frozen` (R-AX) guards
  // `phone`/`phone_e164` on a refused seat in the database, where no hook can
  // be bypassed. The translation stays for it, and for any path a later wave
  // adds — a raw Postgres string is rendered verbatim into the party sheet's
  // own error slot.
  const FROZEN = {
    message: 'consent_legacy_column_frozen',
    code: 'P0001',
    hint: 'project_parties.sms_consent_* is legacy since 00594.',
  };

  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
  });

  it('useUpdateProjectParty turns a freeze refusal into a sentence', async () => {
    const currentMaybeSingle = vi.fn().mockResolvedValue({
      data: { phone_e164: '+15551234567', project_id: 'proj-1' },
      error: null,
    });
    const currentEq = vi.fn(() => ({ maybeSingle: currentMaybeSingle }));
    const single = vi.fn().mockResolvedValue({ data: null, error: FROZEN });
    const selectAfterUpdate = vi.fn(() => ({ single }));
    const updateEq = vi.fn(() => ({ select: selectAfterUpdate }));
    const update = vi.fn(() => ({ eq: updateEq }));
    from
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: currentEq })) })
      .mockReturnValueOnce({ update });
    rpc.mockImplementation((fn: string) => {
      if (fn === 'project_consent_org') return Promise.resolve({ data: 'org-1', error: null });
      if (fn === 'channel_consent_status') return Promise.resolve({ data: null, error: null });
      throw new Error(`unexpected rpc ${fn}`);
    });

    const hook = useUpdateProjectParty() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await expect(
      hook.mutationFn({
        id: 'party-1',
        projectId: 'proj-1',
        patch: { phone: '612-555-0199' },
      }),
    ).rejects.toThrow(/Texting consent has moved to the studio's own record/);
  });
});
