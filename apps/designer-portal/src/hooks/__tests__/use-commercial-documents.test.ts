const rpc = jest.fn();
const invoke = jest.fn();
const invalidateQueries = jest.fn();
const fromMock = jest.fn();
const fetchMock = jest.fn();

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
  invalidateProjectWorkflow: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries, setQueryData: jest.fn() }),
}));

import {
  fetchCommercialDocumentBundle,
  useCountersignDesignServicesAgreement,
  useDeriveWorkingBudget,
  useExecuteFurnishingsAuthorizationOnPaper,
  useExecuteTradeScopeOnPaper,
  useOverrideBudgetCheckpoint,
  usePublishBudgetCheckpoint,
  useRecordPaperClientSignature,
  useRecordPaperTradeAcceptance,
  useReleaseForAuthorization,
  useReplayCommercialNotification,
  useSendFurnishingsAuthorization,
  useSendTradeRfq,
  useSetBudgetTargets,
  useVoidAuthorization,
} from '../use-commercial-documents';

/** Chainable stub for `.from('commercial_document_signatures').select(...)
 *  .eq(...).eq(...).maybeSingle()` — useCountersignDesignServicesAgreement's
 *  paper-detection read. Defaults to "no client signature found" (not paper),
 *  matching every pre-existing countersign test's expectations unless a test
 *  overrides it. */
function stubSignatureLookup(
  row: { metadata?: Record<string, unknown> } | null = null,
  error: { message?: string } | null = null,
) {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error }),
        }),
      }),
    }),
  });
}

describe('designer commercial document hooks', () => {
  beforeEach(() => {
    rpc.mockReset();
    invoke.mockReset();
    invalidateQueries.mockReset();
    fromMock.mockReset();
    stubSignatureLookup(null);
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
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
      mutationFn: (input: { signerName: string; disclosedImpact?: unknown }) => Promise<Record<string, unknown>>;
    };

    const result = await mutation.mutationFn({ signerName: 'Morgan Designer' });

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
      mutationFn: (input: { signerName: string; disclosedImpact?: unknown }) => Promise<Record<string, unknown>>;
    };

    const result = await mutation.mutationFn({ signerName: 'Morgan Designer' });

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
      mutationFn: (input: { signerName: string; disclosedImpact?: unknown }) => Promise<Record<string, unknown>>;
    };

    const result = await mutation.mutationFn({ signerName: 'Morgan Designer' });

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

  it('routes the execution notice through paper-notify (not the direct invoke) when the client signature was recorded on paper', async () => {
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
    stubSignatureLookup({ metadata: { executedOnPaper: true } });
    const mutation = useCountersignDesignServicesAgreement('agreement-1') as unknown as {
      mutationFn: (input: { signerName: string; disclosedImpact?: unknown }) => Promise<Record<string, unknown>>;
    };

    const result = await mutation.mutationFn({ signerName: 'Morgan Designer' });

    expect(fromMock).toHaveBeenCalledWith('commercial_document_signatures');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/commercial/agreement-1/paper-notify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ transition: 'executed' }),
      }),
    );
    // The direct, non-paper channel never fires for a paper signature — that
    // would mean two notices (one wrong-copy) for one execution.
    expect(invoke).not.toHaveBeenCalled();
    expect(result.notificationDelivery).toBe('delivered');
  });

  it('degrades to pending_retry, and fires NEITHER notify path, when the paper-detection read itself fails', async () => {
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
    stubSignatureLookup(null, { message: 'permission denied for table commercial_document_signatures' });
    const mutation = useCountersignDesignServicesAgreement('agreement-1') as unknown as {
      mutationFn: (input: { signerName: string; disclosedImpact?: unknown }) => Promise<Record<string, unknown>>;
    };

    const result = await mutation.mutationFn({ signerName: 'Morgan Designer' });

    // A failed read must never be read as "not paper" — that would silently
    // send the wrong-channel (online) copy for what might actually be a
    // paper-executed document.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(result.notificationDelivery).toBe('pending_retry');
    // The countersign RPC itself already committed — this never blocks it.
    expect(result.newlyExecuted).toBe(true);
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

  describe('executed on paper', () => {
    it('records a design-services paper signature and never touches paper-notify (the route 400s client_signed)', async () => {
      rpc.mockResolvedValue({ data: { proposalId: 'agreement-1' }, error: null });
      const mutation = useRecordPaperClientSignature('agreement-1') as unknown as {
        mutationFn: (input: {
          signedName: string;
          paperSignedOn: string;
          scanDocumentId?: string | null;
        }) => Promise<Record<string, unknown>>;
      };

      const result = await mutation.mutationFn({
        signedName: 'Harper Vale',
        paperSignedOn: '2026-08-04',
        scanDocumentId: 'scan-1',
      });

      expect(rpc).toHaveBeenCalledWith('record_paper_client_signature', {
        p_proposal_id: 'agreement-1',
        p_signed_name: 'Harper Vale',
        p_paper_signed_on: '2026-08-04',
        p_scan_document_id: 'scan-1',
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.notificationDelivery).toBe('not_requested');
    });

    it('executes a furnishings authorization on paper, then chains deposit_ready when the RPC raised a deposit invoice', async () => {
      rpc.mockResolvedValue({
        data: { depositInvoiceId: 'invoice-1', newlyExecuted: true },
        error: null,
      });
      const mutation = useExecuteFurnishingsAuthorizationOnPaper('project-1') as unknown as {
        mutationFn: (input: {
          proposalId: string;
          signedName: string;
          paperSignedOn: string;
          scanDocumentId?: string | null;
        }) => Promise<Record<string, unknown>>;
      };

      const result = await mutation.mutationFn({
        proposalId: 'authorization-1',
        signedName: 'Harper Vale',
        paperSignedOn: '2026-08-04',
      });

      expect(rpc).toHaveBeenCalledWith('execute_furnishings_authorization_on_paper', {
        p_proposal_id: 'authorization-1',
        p_signed_name: 'Harper Vale',
        p_paper_signed_on: '2026-08-04',
        p_scan_document_id: null,
        p_disclosed_impact: null,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        '/api/commercial/authorization-1/paper-notify',
        expect.objectContaining({ body: JSON.stringify({ transition: 'furnishings_executed' }) }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/commercial/authorization-1/paper-notify',
        expect.objectContaining({ body: JSON.stringify({ transition: 'deposit_ready' }) }),
      );
      expect(result.notificationDelivery).toBe('delivered');
      expect(result.depositNotificationDelivery).toBe('delivered');
    });

    it('does not chain deposit_ready for a furnishings authorization with no deposit due', async () => {
      rpc.mockResolvedValue({ data: { newlyExecuted: true }, error: null });
      const mutation = useExecuteFurnishingsAuthorizationOnPaper('project-1') as unknown as {
        mutationFn: (input: {
          proposalId: string;
          signedName: string;
          paperSignedOn: string;
        }) => Promise<Record<string, unknown>>;
      };

      const result = await mutation.mutationFn({
        proposalId: 'authorization-1',
        signedName: 'Harper Vale',
        paperSignedOn: '2026-08-04',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.depositNotificationDelivery).toBe('not_requested');
    });

    it('executes a trade scope on paper, then chains deposit_ready when the RPC auto-issued the first draw', async () => {
      rpc.mockResolvedValue({
        data: { depositInvoiceId: 'invoice-2', newlyExecuted: true },
        error: null,
      });
      const mutation = useExecuteTradeScopeOnPaper('project-1') as unknown as {
        mutationFn: (input: {
          proposalId: string;
          signedName: string;
          paperSignedOn: string;
        }) => Promise<Record<string, unknown>>;
      };

      const result = await mutation.mutationFn({
        proposalId: 'trade-scope-1',
        signedName: 'Harper Vale',
        paperSignedOn: '2026-08-04',
      });

      expect(rpc).toHaveBeenCalledWith('execute_trade_scope_on_paper', {
        p_proposal_id: 'trade-scope-1',
        p_signed_name: 'Harper Vale',
        p_paper_signed_on: '2026-08-04',
        p_scan_document_id: null,
      });
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        '/api/commercial/trade-scope-1/paper-notify',
        expect.objectContaining({ body: JSON.stringify({ transition: 'trade_scope_executed' }) }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/commercial/trade-scope-1/paper-notify',
        expect.objectContaining({ body: JSON.stringify({ transition: 'deposit_ready' }) }),
      );
      expect(result.depositNotificationDelivery).toBe('delivered');
    });

    it('records a paper trade acceptance, passes its own scan pointer, and now notifies the client through paper-notify (ruling adjustment)', async () => {
      rpc.mockResolvedValue({ data: { progressState: 'accepted' }, error: null });
      const mutation = useRecordPaperTradeAcceptance('project-1') as unknown as {
        mutationFn: (input: {
          proposalId: string;
          signedName: string;
          paperSignedOn: string;
          scanDocumentId?: string | null;
        }) => Promise<Record<string, unknown>>;
      };

      const result = await mutation.mutationFn({
        proposalId: 'trade-scope-1',
        signedName: 'Harper Vale',
        paperSignedOn: '2026-08-04',
        scanDocumentId: 'scan-doc-3',
      });

      expect(rpc).toHaveBeenCalledWith('record_paper_trade_acceptance', {
        p_proposal_id: 'trade-scope-1',
        p_signed_name: 'Harper Vale',
        p_paper_signed_on: '2026-08-04',
        p_scan_document_id: 'scan-doc-3',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/commercial/trade-scope-1/paper-notify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ transition: 'trade_scope_accepted' }),
        }),
      );
      expect(result.notificationDelivery).toBe('delivered');
    });

    it('sends p_scan_document_id as null when no acceptance scan was attached', async () => {
      rpc.mockResolvedValue({ data: { progressState: 'accepted' }, error: null });
      const mutation = useRecordPaperTradeAcceptance('project-1') as unknown as {
        mutationFn: (input: {
          proposalId: string;
          signedName: string;
          paperSignedOn: string;
        }) => Promise<Record<string, unknown>>;
      };

      await mutation.mutationFn({
        proposalId: 'trade-scope-1',
        signedName: 'Harper Vale',
        paperSignedOn: '2026-08-04',
      });

      expect(rpc).toHaveBeenCalledWith('record_paper_trade_acceptance', {
        p_proposal_id: 'trade-scope-1',
        p_signed_name: 'Harper Vale',
        p_paper_signed_on: '2026-08-04',
        p_scan_document_id: null,
      });
    });

    it('invalidates the proposal folio query when a paper execution carried a scan, so it appears in the Folio strip', async () => {
      rpc.mockResolvedValue({ data: { newlyExecuted: true }, error: null });
      const mutation = useExecuteFurnishingsAuthorizationOnPaper('project-1') as unknown as {
        mutationFn: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
        onSuccess: (data: unknown, variables: Record<string, unknown>) => Promise<unknown>;
      };
      const variables = {
        proposalId: 'authorization-1',
        signedName: 'Harper Vale',
        paperSignedOn: '2026-08-04',
        scanDocumentId: 'scan-doc-4',
      };

      const data = await mutation.mutationFn(variables);
      await mutation.onSuccess(data, variables);

      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['proposal-folio', 'authorization-1'],
      });
    });

    it('does not invalidate the proposal folio query when no scan was attached', async () => {
      rpc.mockResolvedValue({ data: { newlyExecuted: true }, error: null });
      const mutation = useExecuteFurnishingsAuthorizationOnPaper('project-1') as unknown as {
        mutationFn: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
        onSuccess: (data: unknown, variables: Record<string, unknown>) => Promise<unknown>;
      };
      const variables = {
        proposalId: 'authorization-1',
        signedName: 'Harper Vale',
        paperSignedOn: '2026-08-04',
      };

      const data = await mutation.mutationFn(variables);
      await mutation.onSuccess(data, variables);

      expect(invalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ['proposal-folio', 'authorization-1'],
      });
    });

    it('degrades a paper-notify transport failure to pending_retry rather than throwing', async () => {
      rpc.mockResolvedValue({ data: { newlyExecuted: true }, error: null });
      fetchMock.mockRejectedValue(new Error('network down'));
      const mutation = useExecuteFurnishingsAuthorizationOnPaper('project-1') as unknown as {
        mutationFn: (input: {
          proposalId: string;
          signedName: string;
          paperSignedOn: string;
        }) => Promise<Record<string, unknown>>;
      };

      const result = await mutation.mutationFn({
        proposalId: 'authorization-1',
        signedName: 'Harper Vale',
        paperSignedOn: '2026-08-04',
      });

      expect(result.notificationDelivery).toBe('pending_retry');
    });
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

/**
 * The mapper, at the seam it actually reads: the designer reads
 * commercial_document_signatures DIRECTLY (studio RLS covers the whole row),
 * so `paperSignedOn` comes off `metadata`, not off the client bundle RPC's
 * allowlist. It is a calendar day and stays a string — turning it into a Date
 * here is exactly how it would start rendering a day early.
 */
describe('fetchCommercialDocumentBundle — signature provenance', () => {
  function stubBundleTables(signatureRows: Array<Record<string, unknown>>) {
    fromMock.mockImplementation((table: string) => {
      if (table === 'proposals') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: 'agreement-1',
                    document_kind: 'design_services',
                    commercial_state: 'executed',
                    title: 'Whitfield design agreement',
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'proposal_service_terms') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === 'proposal_service_rates') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: signatureRows, error: null }),
          }),
        }),
      };
    });
  }

  it('carries the day on the paper alongside the day it was recorded', async () => {
    stubBundleTables([
      {
        id: 'sig-1',
        proposal_id: 'agreement-1',
        party_role: 'client',
        signed_name: 'Jamie Client',
        evidence_fingerprint: 'fp-1',
        // Recorded in August; the paper itself was signed in January.
        signed_at: '2026-08-05T14:20:00Z',
        metadata: {
          executedOnPaper: true,
          paperSignedOn: '2026-01-15',
          recordedBy: 'studio-user-1',
        },
      },
    ]);

    const bundle = await fetchCommercialDocumentBundle('agreement-1');

    expect(bundle.signatures[0]).toMatchObject({
      party: 'client',
      executedOnPaper: true,
      paperSignedOn: '2026-01-15',
      signedAt: '2026-08-05T14:20:00Z',
    });
  });

  it('leaves paperSignedOn null on a portal signature, which has only one date', async () => {
    stubBundleTables([
      {
        id: 'sig-2',
        proposal_id: 'agreement-1',
        party_role: 'client',
        signed_name: 'Jamie Client',
        evidence_fingerprint: 'fp-2',
        signed_at: '2026-08-05T14:20:00Z',
        metadata: { consent_version: 1 },
      },
    ]);

    const bundle = await fetchCommercialDocumentBundle('agreement-1');

    expect(bundle.signatures[0]).toMatchObject({
      executedOnPaper: false,
      paperSignedOn: null,
    });
  });
});
