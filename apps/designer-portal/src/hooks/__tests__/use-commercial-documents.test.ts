const rpc = jest.fn();
const invoke = jest.fn();
const invalidateQueries = jest.fn();
const fromMock = jest.fn();

jest.mock('@patina/supabase', () => ({
  commercialKeys: {
    all: ['commercial-documents'],
    document: (id: string) => ['commercial-documents', id],
    authority: (id: string) => ['project-authority', id],
    budget: (id: string) => ['working-budget', id],
    waves: (id: string) => ['furnishings-authorizations', id],
    instruments: (id: string) => ['furnishings-authorizations', id],
  },
  createBrowserClient: () => ({ rpc, functions: { invoke }, from: fromMock }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries, setQueryData: jest.fn() }),
}));

import {
  useCountersignDesignServicesAgreement,
  useDeriveWorkingBudget,
  useOverrideBudgetCheckpoint,
  usePublishBudgetCheckpoint,
  useReleaseForAuthorization,
  useReplayCommercialNotification,
  useSendFurnishingsAuthorization,
  useSendTradeRfq,
  useSetBudgetTargets,
  useVoidAuthorization,
} from '../use-commercial-documents';

describe('designer commercial document hooks', () => {
  beforeEach(() => {
    rpc.mockReset();
    invoke.mockReset();
    invalidateQueries.mockReset();
    fromMock.mockReset();
  });

  it('accepts the canonical camelCase countersign receipt and notifies once', async () => {
    rpc.mockResolvedValue({
      data: {
        proposalId: 'agreement-1',
        commercialState: 'executed',
        projectId: 'project-1',
        agreementId: 'agreement-1',
        billingAuthorityId: 'authority-1',
        newlyExecuted: true,
      },
      error: null,
    });
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const mutation = useCountersignDesignServicesAgreement('agreement-1') as unknown as {
      mutationFn: (name: string) => Promise<Record<string, unknown>>;
    };

    const result = await mutation.mutationFn('Morgan Designer');

    expect(result).toEqual(
      expect.objectContaining({
        projectId: 'project-1',
        billingAuthorityId: 'authority-1',
        newlyExecuted: true,
        notificationDelivery: 'delivered',
      })
    );
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'agreement-1', transition: 'executed' },
    });
  });

  it('keeps countersign durable while returning a retry posture for failed notice delivery', async () => {
    rpc.mockResolvedValue({
      data: {
        proposalId: 'agreement-1',
        commercialState: 'executed',
        projectId: 'project-1',
        agreementId: 'agreement-1',
        billingAuthorityId: 'authority-1',
        newlyExecuted: true,
      },
      error: null,
    });
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'edge unavailable' },
    });
    const mutation = useCountersignDesignServicesAgreement('agreement-1') as unknown as {
      mutationFn: (name: string) => Promise<Record<string, unknown>>;
    };

    const result = await mutation.mutationFn('Morgan Designer');

    expect(result).toEqual(
      expect.objectContaining({
        newlyExecuted: true,
        notificationDelivery: 'pending_retry',
      })
    );
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('replays the execution notice when a committed countersign is retried', async () => {
    rpc.mockResolvedValue({
      data: {
        proposalId: 'agreement-1',
        commercialState: 'executed',
        projectId: 'project-1',
        agreementId: 'agreement-1',
        billingAuthorityId: 'authority-1',
        newlyExecuted: false,
      },
      error: null,
    });
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const mutation = useCountersignDesignServicesAgreement('agreement-1') as unknown as {
      mutationFn: (name: string) => Promise<Record<string, unknown>>;
    };

    const result = await mutation.mutationFn('Morgan Designer');

    expect(result).toEqual(
      expect.objectContaining({
        newlyExecuted: false,
        notificationDelivery: 'delivered',
      })
    );
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'agreement-1', transition: 'executed' },
    });
  });

  it('publishes checkpoints and requires an audited override reason', async () => {
    rpc.mockResolvedValue({
      data: { checkpointId: 'checkpoint-1' },
      error: null,
    });
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const publish = usePublishBudgetCheckpoint('project-1') as unknown as {
      mutationFn: (input: { versionId: string; agreementId: string }) => Promise<unknown>;
    };
    const override = useOverrideBudgetCheckpoint('project-1') as unknown as {
      mutationFn: (input: { checkpointId: string; reason: string }) => Promise<unknown>;
    };

    const published = await publish.mutationFn({
      versionId: 'version-1',
      agreementId: 'agreement-1',
    });
    expect(published).toEqual(
      expect.objectContaining({
        checkpointId: 'checkpoint-1',
        notificationDelivery: 'delivered',
      })
    );
    expect(rpc).toHaveBeenCalledWith('publish_budget_checkpoint', {
      p_project_id: 'project-1',
      p_version_id: 'version-1',
    });
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: {
        documentId: 'agreement-1',
        transition: 'budget_published',
        eventId: 'checkpoint-1',
      },
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    await expect(override.mutationFn({ checkpointId: 'checkpoint-1', reason: 'no' })).rejects.toThrow(
      'meaningful reason'
    );
    await override.mutationFn({
      checkpointId: 'checkpoint-1',
      reason: 'Client confirmed on the recorded call.',
    });
    expect(rpc).toHaveBeenLastCalledWith('override_budget_checkpoint', {
      p_checkpoint_id: 'checkpoint-1',
      p_reason: 'Client confirmed on the recorded call.',
    });
  });

  it('surfaces a resolved budget notice invoke error as pending retry', async () => {
    rpc.mockResolvedValue({
      data: { checkpointId: 'checkpoint-1' },
      error: null,
    });
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'edge unavailable' },
    });
    const publish = usePublishBudgetCheckpoint('project-1') as unknown as {
      mutationFn: (input: { versionId: string; agreementId: string }) => Promise<Record<string, unknown>>;
    };

    const result = await publish.mutationFn({
      versionId: 'version-1',
      agreementId: 'agreement-1',
    });

    expect(result.notificationDelivery).toBe('pending_retry');
  });

  it('replays a committed notification with its deterministic event identity', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const replay = useReplayCommercialNotification() as unknown as {
      mutationFn: (input: { documentId: string; transition: 'budget_published'; eventId: string }) => Promise<string>;
    };

    await expect(
      replay.mutationFn({
        documentId: 'agreement-1',
        transition: 'budget_published',
        eventId: 'checkpoint-1',
      })
    ).resolves.toBe('delivered');
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: {
        documentId: 'agreement-1',
        transition: 'budget_published',
        eventId: 'checkpoint-1',
      },
    });
  });

  it('releases FF&E schedule items into a fresh authorization and invalidates project commerce + the schedule', async () => {
    rpc.mockResolvedValue({
      data: {
        proposalId: 'authorization-1',
        documentId: 'authorization-doc-1',
        itemCount: 2,
      },
      error: null,
    });
    const mutation = useReleaseForAuthorization('project-1') as unknown as {
      mutationFn: (input: {
        name: string;
        ffeItemIds: string[];
        depositPercent?: number;
      }) => Promise<{ proposalId: string; documentId: string; itemCount: number }>;
      onSuccess: () => void | Promise<void>;
    };

    const result = await mutation.mutationFn({
      name: 'Living Room Essentials',
      ffeItemIds: ['ffe-1', 'ffe-2'],
      depositPercent: 50,
    });

    expect(rpc).toHaveBeenCalledWith(
      'create_furnishings_authorization_from_schedule',
      {
        p_project_id: 'project-1',
        p_name: 'Living Room Essentials',
        p_ffe_item_ids: ['ffe-1', 'ffe-2'],
        p_deposit_percent: 50,
      },
    );
    expect(result).toEqual({
      proposalId: 'authorization-1',
      documentId: 'authorization-doc-1',
      itemCount: 2,
    });

    await mutation.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['working-budget', 'project-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['furnishings-authorizations', 'project-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-authority', 'project-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-v2', 'project-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-ffe-items', 'project-1'],
    });
  });

  it('rejects releasing for authorization with no chosen schedule items', async () => {
    const mutation = useReleaseForAuthorization('project-1') as unknown as {
      mutationFn: (input: {
        name: string;
        ffeItemIds: string[];
      }) => Promise<unknown>;
    };

    await expect(
      mutation.mutationFn({ name: 'Living Room Essentials', ffeItemIds: [] }),
    ).rejects.toThrow('Choose at least one schedule item');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires a meaningful reason to void an authorization, then invalidates the schedule too', async () => {
    rpc.mockResolvedValue({ data: { voided: true }, error: null });
    const mutation = useVoidAuthorization('project-1') as unknown as {
      mutationFn: (input: {
        proposalId: string;
        reason: string;
      }) => Promise<unknown>;
      onSuccess: () => void | Promise<void>;
    };

    await expect(
      mutation.mutationFn({ proposalId: 'authorization-1', reason: 'no' }),
    ).rejects.toThrow('meaningful reason');
    expect(rpc).not.toHaveBeenCalled();

    await mutation.mutationFn({
      proposalId: 'authorization-1',
      reason: 'Client requested fewer pieces on the call.',
    });
    expect(rpc).toHaveBeenCalledWith('void_furnishings_authorization', {
      p_proposal_id: 'authorization-1',
      p_reason: 'Client requested fewer pieces on the call.',
    });

    await mutation.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['furnishings-authorizations', 'project-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-ffe-items', 'project-1'],
    });
  });

  it('derives a fresh working-budget draft from the live schedule', async () => {
    rpc.mockResolvedValue({ data: { versionId: 'version-2' }, error: null });
    const mutation = useDeriveWorkingBudget('project-1') as unknown as {
      mutationFn: () => Promise<unknown>;
      onSuccess: () => void | Promise<void>;
    };

    await mutation.mutationFn();
    expect(rpc).toHaveBeenCalledWith('derive_working_budget_draft', {
      p_project_id: 'project-1',
    });

    await mutation.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['working-budget', 'project-1'],
    });
  });

  it('writes a single target cell directly onto the draft version\'s own rows', async () => {
    const eq2 = jest.fn().mockResolvedValue({ error: null });
    const eq1 = jest.fn(() => ({ eq: eq2 }));
    const update = jest.fn(() => ({ eq: eq1 }));
    fromMock.mockReturnValue({ update });
    rpc.mockResolvedValue({ data: { version: { id: 'version-1' } }, error: null });

    const mutation = useSetBudgetTargets('project-1') as unknown as {
      mutationFn: (input: {
        versionId: string;
        lineId: string;
        targetCents: number;
      }) => Promise<unknown>;
    };

    await mutation.mutationFn({
      versionId: 'version-1',
      lineId: 'line-1',
      targetCents: 150_000,
    });

    expect(fromMock).toHaveBeenCalledWith('project_budget_lines');
    expect(update).toHaveBeenCalledWith({ target_cents: 150_000 });
    expect(eq1).toHaveBeenCalledWith('id', 'line-1');
    expect(eq2).toHaveBeenCalledWith('budget_version_id', 'version-1');
  });

  it('rejects a negative budget target before writing anything', async () => {
    const mutation = useSetBudgetTargets('project-1') as unknown as {
      mutationFn: (input: {
        versionId: string;
        lineId: string;
        targetCents: number;
      }) => Promise<unknown>;
    };

    await expect(
      mutation.mutationFn({
        versionId: 'version-1',
        lineId: 'line-1',
        targetCents: -1,
      }),
    ).rejects.toThrow('zero or more');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('uses proposal-send as the single client delivery for a sent wave', async () => {
    rpc
      .mockResolvedValueOnce({
        data: { documentFingerprint: 'fingerprint-1' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          sentAt: '2026-08-03T12:00:00Z',
          proposalSendDispatchId: 'dispatch-1',
        },
        error: null,
      });
    invoke.mockResolvedValue({
      data: { delivery_state: 'delivered' },
      error: null,
    });
    const mutation = useSendFurnishingsAuthorization('project-1') as unknown as {
      mutationFn: (proposalId: string) => Promise<unknown>;
    };

    const result = (await mutation.mutationFn('wave-proposal-1')) as Record<string, unknown>;

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('proposal-send', {
      body: {
        proposalId: 'wave-proposal-1',
        sentAt: '2026-08-03T12:00:00Z',
        dispatchId: 'dispatch-1',
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        _emailDispatched: true,
        _emailDeliveryState: 'delivered',
        _emailRetryable: false,
      })
    );
  });

  it('does not repeat the durable FF&E send when edge delivery is pending', async () => {
    rpc
      .mockResolvedValueOnce({
        data: { documentFingerprint: 'fingerprint-1' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          sentAt: '2026-08-03T12:00:00Z',
          proposalSendDispatchId: 'dispatch-1',
        },
        error: null,
      });
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'edge unavailable' },
    });
    const mutation = useSendFurnishingsAuthorization('project-1') as unknown as {
      mutationFn: (proposalId: string) => Promise<Record<string, unknown>>;
    };

    const result = await mutation.mutationFn('wave-proposal-1');

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        _emailDispatched: false,
        _emailDeliveryState: 'pending',
        _emailRetryable: true,
        proposalSendDispatchId: 'dispatch-1',
      })
    );
  });

  describe('useSendTradeRfq — trade-rfq-send failure copy', () => {
    const resendInput = { partyId: 'party-1', existingRfqId: 'rfq-1' };

    const mutationFnOf = (scopeId = 'scope-1') =>
      (useSendTradeRfq(scopeId) as unknown as {
        mutationFn: (input: typeof resendInput) => Promise<unknown>;
      }).mutationFn;

    it('surfaces the specific no_recipient copy from a resolved error body', async () => {
      invoke.mockResolvedValue({
        data: {
          error: 'no_recipient',
          detail: 'No party email on file — set the party\'s email and try again.',
        },
        error: null,
      });

      await expect(mutationFnOf()(resendInput)).rejects.toThrow(
        'No party email on file',
      );
    });

    it('surfaces a detail string carried by a thrown FunctionsHttpError JSON body', async () => {
      invoke.mockResolvedValue({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: {
            json: () =>
              Promise.resolve({ error: 'send_failed', detail: 'provider_down' }),
          },
        },
      });

      await expect(mutationFnOf()(resendInput)).rejects.toThrow('provider_down');
    });

    it('falls back to brand-voice generic copy — never the raw SDK string — when the thrown error carries no JSON body', async () => {
      invoke.mockResolvedValue({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          // No `context`, matching a network-level failure or a non-JSON
          // response the SDK could not parse.
        },
      });

      await expect(mutationFnOf()(resendInput)).rejects.toThrow(
        "The request could not be sent. Check the party's email and try again.",
      );
    });

    it('falls back to brand-voice generic copy when context.json() itself rejects', async () => {
      invoke.mockResolvedValue({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: { json: () => Promise.reject(new Error('not json')) },
        },
      });

      await expect(mutationFnOf()(resendInput)).rejects.toThrow(
        "The request could not be sent. Check the party's email and try again.",
      );
    });

    it('falls back to brand-voice generic copy when the resolved body carries an error code but no detail', async () => {
      invoke.mockResolvedValue({
        data: { error: 'stamp_failed' },
        error: null,
      });

      await expect(mutationFnOf()(resendInput)).rejects.toThrow(
        "The request could not be sent. Check the party's email and try again.",
      );
    });
  });
});
