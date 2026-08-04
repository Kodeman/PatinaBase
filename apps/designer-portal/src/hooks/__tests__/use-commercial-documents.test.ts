const rpc = jest.fn();
const invoke = jest.fn();
const invalidateQueries = jest.fn();

jest.mock('@patina/supabase', () => ({
  commercialKeys: {
    all: ['commercial-documents'],
    document: (id: string) => ['commercial-documents', id],
    authority: (id: string) => ['project-authority', id],
    budget: (id: string) => ['working-budget', id],
    waves: (id: string) => ['furnishings-authorizations', id],
  },
  createBrowserClient: () => ({ rpc, functions: { invoke } }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries, setQueryData: jest.fn() }),
}));

import {
  useCountersignDesignServicesAgreement,
  useCreateFurnishingsAuthorization,
  useOverrideBudgetCheckpoint,
  usePublishBudgetCheckpoint,
  useSendFurnishingsAuthorization,
} from '../use-commercial-documents';

describe('designer commercial document hooks', () => {
  beforeEach(() => {
    rpc.mockReset();
    invoke.mockReset();
    invalidateQueries.mockReset();
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

    expect(result).toEqual(expect.objectContaining({
      projectId: 'project-1',
      billingAuthorityId: 'authority-1',
      newlyExecuted: true,
    }));
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'agreement-1', transition: 'executed' },
    });
  });

  it('publishes checkpoints and requires an audited override reason', async () => {
    rpc.mockResolvedValue({ data: { checkpointId: 'checkpoint-1' }, error: null });
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const publish = usePublishBudgetCheckpoint('project-1') as unknown as {
      mutationFn: (input: { versionId: string; agreementId: string }) => Promise<unknown>;
    };
    const override = useOverrideBudgetCheckpoint('project-1') as unknown as {
      mutationFn: (input: { checkpointId: string; reason: string }) => Promise<unknown>;
    };

    await publish.mutationFn({
      versionId: 'version-1',
      agreementId: 'agreement-1',
    });
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

    await expect(
      override.mutationFn({ checkpointId: 'checkpoint-1', reason: 'no' }),
    ).rejects.toThrow('meaningful reason');
    await override.mutationFn({
      checkpointId: 'checkpoint-1',
      reason: 'Client confirmed on the recorded call.',
    });
    expect(rpc).toHaveBeenLastCalledWith('override_budget_checkpoint', {
      p_checkpoint_id: 'checkpoint-1',
      p_reason: 'Client confirmed on the recorded call.',
    });
  });

  it('creates a draft wave without notifying the client', async () => {
    rpc.mockResolvedValue({
      data: {
        proposalId: 'wave-proposal-1',
        documentId: 'wave-document-1',
        commercialState: 'draft',
      },
      error: null,
    });
    const mutation = useCreateFurnishingsAuthorization('project-1') as unknown as {
      mutationFn: (input: { waveName: string; sourceProposalId: string }) => Promise<unknown>;
    };

    await mutation.mutationFn({
      waveName: 'Living Room Essentials',
      sourceProposalId: 'source-proposal-1',
    });

    expect(rpc).toHaveBeenCalledWith('create_furnishings_authorization', {
      p_project_id: 'project-1',
      p_wave_name: 'Living Room Essentials',
      p_source_proposal_id: 'source-proposal-1',
    });
    expect(invoke).not.toHaveBeenCalled();
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
    invoke.mockResolvedValue({ data: { delivery_state: 'delivered' }, error: null });
    const mutation = useSendFurnishingsAuthorization('project-1') as unknown as {
      mutationFn: (proposalId: string) => Promise<unknown>;
    };

    await mutation.mutationFn('wave-proposal-1');

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('proposal-send', {
      body: {
        proposalId: 'wave-proposal-1',
        sentAt: '2026-08-03T12:00:00Z',
        dispatchId: 'dispatch-1',
      },
    });
  });
});
