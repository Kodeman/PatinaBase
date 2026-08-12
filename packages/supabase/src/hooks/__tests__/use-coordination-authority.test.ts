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

describe('useRecordPartySmsConsent — the only writer of consent columns on an existing party', () => {
  const PARTY_ID = 'party-1';
  const PHONE = '5551234567';
  const E164 = '+15551234567';

  /** `.select('phone_e164').eq('id', …).maybeSingle()` — the pre-write
   *  self-row lookup (F3's phone_e164 source, and F2's skip-the-sibling-
   *  check-without-a-phone path). */
  function selfRowBuilder(result: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    return { select, eq, maybeSingle };
  }

  /** `.select('id').eq('phone_e164', …).eq('sms_consent_status', 'opted_out').limit(1)`
   *  — the F3 phone-global opt-out check. */
  function siblingBuilder(result: { data: unknown; error: unknown }) {
    const limit = vi.fn().mockResolvedValue(result);
    const eq2 = vi.fn(() => ({ limit }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    return { select, eq1, eq2, limit };
  }

  /** `.update(payload).eq('id', …).eq('phone', …).eq('sms_consent_status', 'not_asked').select().single()`
   *  — the six-column write itself, phone-pinned (F4). */
  function mainUpdateBuilder(result: { data: unknown; error: unknown }) {
    const single = vi.fn().mockResolvedValue(result);
    const select = vi.fn(() => ({ single }));
    const eq3 = vi.fn(() => ({ select }));
    const eq2 = vi.fn(() => ({ eq: eq3 }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: eq1 }));
    return { update, eq1, eq2, eq3, select, single };
  }

  /** `.update(revertPayload).eq('id', …)` — the F2 not_asked revert; no
   *  `.select()` follows, so the mock's `eq` resolves directly. */
  function revertUpdateBuilder(result: { error: unknown }) {
    const eq = vi.fn().mockResolvedValue(result);
    const update = vi.fn((_payload: Record<string, unknown>) => ({ eq }));
    return { update, eq };
  }

  function config() {
    return useRecordPartySmsConsent() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
  }

  it('writes exactly the six not_asked→pending columns, stamped with the attester (F1), pinned to the phone (F4), after clearing the F3 opt-out check', async () => {
    const self = selfRowBuilder({ data: { phone_e164: E164 }, error: null });
    const sibling = siblingBuilder({ data: [], error: null });
    const main = mainUpdateBuilder({
      data: { id: PARTY_ID, project_id: 'proj-1', phone_e164: E164 },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: self.select })
      .mockReturnValueOnce({ select: sibling.select })
      .mockReturnValueOnce({ update: main.update });

    await config().mutationFn({
      partyId: PARTY_ID,
      phone: PHONE,
      smsConsentSource: 'verbal',
      smsConsentEvidence: 'Told me at the site kickoff on Aug 8',
    });

    // F3 — self row's phone_e164 looked up, then checked for an opted-out sibling.
    expect(self.eq).toHaveBeenCalledWith('id', PARTY_ID);
    expect(sibling.eq1).toHaveBeenCalledWith('phone_e164', E164);
    expect(sibling.eq2).toHaveBeenCalledWith('sms_consent_status', 'opted_out');
    expect(sibling.limit).toHaveBeenCalledWith(1);

    // F1 — the attester comes from the authenticated user, not the caller.
    expect(getUser).toHaveBeenCalledTimes(1);

    expect(main.update).toHaveBeenCalledTimes(1);
    const payload = main.update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      [
        'sms_consent_disclosure_version',
        'sms_consent_evidence',
        'sms_consent_recorded_at',
        'sms_consent_recorded_by',
        'sms_consent_source',
        'sms_consent_status',
      ].sort(),
    );
    expect(payload).toEqual({
      sms_consent_status: 'pending',
      sms_consent_source: 'verbal',
      sms_consent_evidence: 'Told me at the site kickoff on Aug 8',
      sms_consent_recorded_at: expect.any(String),
      sms_consent_recorded_by: 'designer-1',
      sms_consent_disclosure_version: 'field-sms-v1',
    });
    // F4 — the phone is pinned alongside the not_asked guard.
    expect(main.eq1).toHaveBeenCalledWith('id', PARTY_ID);
    expect(main.eq2).toHaveBeenCalledWith('phone', PHONE);
    expect(main.eq3).toHaveBeenCalledWith('sms_consent_status', 'not_asked');
  });

  it('F2 — reverts to not_asked (all six columns) and throws a clear error when the updated row has no phone_e164', async () => {
    const self = selfRowBuilder({ data: { phone_e164: null }, error: null });
    const main = mainUpdateBuilder({
      data: { id: PARTY_ID, project_id: 'proj-1', phone_e164: null },
      error: null,
    });
    const revert = revertUpdateBuilder({ error: null });
    from
      .mockReturnValueOnce({ select: self.select })
      .mockReturnValueOnce({ update: main.update })
      .mockReturnValueOnce({ update: revert.update });

    await expect(
      config().mutationFn({
        partyId: PARTY_ID,
        phone: PHONE,
        smsConsentSource: 'verbal',
        smsConsentEvidence: 'Told me at kickoff',
      }),
    ).rejects.toThrow(/can't receive texts/i);

    // No phone_e164 on the self row → the sibling opt-out check never runs.
    expect(from).toHaveBeenCalledTimes(3);
    expect(revert.update).toHaveBeenCalledWith({
      sms_consent_status: 'not_asked',
      sms_consent_source: null,
      sms_consent_evidence: null,
      sms_consent_recorded_at: null,
      sms_consent_recorded_by: null,
      sms_consent_disclosure_version: null,
    });
    expect(revert.eq).toHaveBeenCalledWith('id', PARTY_ID);
  });

  it('F3 — refuses when the phone already opted out on a sibling row, without writing', async () => {
    const self = selfRowBuilder({ data: { phone_e164: E164 }, error: null });
    const sibling = siblingBuilder({ data: [{ id: 'party-2' }], error: null });
    from
      .mockReturnValueOnce({ select: self.select })
      .mockReturnValueOnce({ select: sibling.select });

    await expect(
      config().mutationFn({
        partyId: PARTY_ID,
        phone: PHONE,
        smsConsentSource: 'verbal',
        smsConsentEvidence: 'Told me at kickoff',
      }),
    ).rejects.toThrow(/opted out/i);

    expect(from).toHaveBeenCalledTimes(2);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('F4/F6 — a zero-row match (guard column or pinned phone moved under us) surfaces as a friendly race message, not the raw PGRST116 error', async () => {
    const self = selfRowBuilder({ data: { phone_e164: null }, error: null });
    const main = mainUpdateBuilder({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });
    from
      .mockReturnValueOnce({ select: self.select })
      .mockReturnValueOnce({ update: main.update });

    await expect(
      config().mutationFn({
        partyId: PARTY_ID,
        phone: PHONE,
        smsConsentSource: 'verbal',
        smsConsentEvidence: 'Told me at kickoff',
      }),
    ).rejects.toThrow(/just changed — refresh/i);

    expect(main.eq2).toHaveBeenCalledWith('phone', PHONE);
  });

  it('surfaces a non-race update error verbatim rather than the friendly race copy', async () => {
    const self = selfRowBuilder({ data: { phone_e164: null }, error: null });
    const dbError = { code: '42501', message: 'permission denied' };
    const main = mainUpdateBuilder({ data: null, error: dbError });
    from
      .mockReturnValueOnce({ select: self.select })
      .mockReturnValueOnce({ update: main.update });

    await expect(
      config().mutationFn({
        partyId: PARTY_ID,
        phone: PHONE,
        smsConsentSource: 'verbal',
        smsConsentEvidence: 'Told me at kickoff',
      }),
    ).rejects.toBe(dbError);
  });

  it("refuses to write without a phone, mirroring useAddProjectParty's wantsText guard", async () => {
    await expect(
      config().mutationFn({
        partyId: PARTY_ID,
        phone: '',
        smsConsentSource: 'verbal',
        smsConsentEvidence: 'Told me at kickoff',
      }),
    ).rejects.toThrow(/phone number/i);
    expect(from).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('refuses to write without non-blank evidence', async () => {
    await expect(
      config().mutationFn({
        partyId: PARTY_ID,
        phone: PHONE,
        smsConsentSource: 'verbal',
        smsConsentEvidence: '   ',
      }),
    ).rejects.toThrow(/prior consent/i);
    expect(from).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });
});
