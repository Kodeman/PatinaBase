import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc, functions: { invoke } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  commercialKeys,
  useAcknowledgeBudgetCheckpoint,
  useClientCommercialDocumentBundle,
  useCountersignDesignServicesAgreement,
  useCreateFurnishingsAuthorization,
  useSendCommercialDocument,
  useUpsertDesignServicesDraft,
  useWorkingBudget,
} from '../use-commercial-documents';

type QueryConfig = { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> };
type MutationConfig<TVariables> = {
  mutationFn: (variables: TVariables) => Promise<unknown>;
  onSuccess: (data: any, variables: TVariables) => void;
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: {}, error: null });
  invalidateQueries.mockReset();
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('commercial document hooks', () => {
  it('reads client documents through the client-safe RPC boundary', async () => {
    const query = useClientCommercialDocumentBundle('agreement-1') as unknown as QueryConfig;

    expect(query.queryKey).toEqual(commercialKeys.clientBundle('agreement-1'));
    await query.queryFn();

    expect(rpc).toHaveBeenCalledWith('get_client_commercial_document_bundle', {
      p_proposal_id: 'agreement-1',
    });
  });

  it('countersigns with only the document identity and signer name', async () => {
    rpc.mockResolvedValueOnce({
      data: { projectId: 'project-1', newlyExecuted: true },
      error: null,
    });
    const mutation = useCountersignDesignServicesAgreement() as unknown as MutationConfig<{
      proposalId: string;
      signerName: string;
    }>;

    const result = await mutation.mutationFn({
      proposalId: 'agreement-1',
      signerName: 'Morgan Designer',
    });
    mutation.onSuccess(result, {
      proposalId: 'agreement-1',
      signerName: 'Morgan Designer',
    });

    expect(rpc).toHaveBeenCalledWith('countersign_design_services_agreement', {
      p_proposal_id: 'agreement-1',
      p_signer_name: 'Morgan Designer',
    });
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'agreement-1', transition: 'executed' },
    });
    for (const queryKey of [
      commercialKeys.document('agreement-1'),
      ['proposal', 'agreement-1'],
      ['document-state'],
      ['desk-engagements'],
      ['projects'],
      commercialKeys.authority('project-1'),
      commercialKeys.budget('project-1'),
      commercialKeys.waves('project-1'),
    ]) {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('normalizes the client-safe working-budget RPC shape', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        version: {
          id: 'version-1',
          projectId: 'project-1',
          version: 2,
          status: 'published',
          currency: 'USD',
          lowTotalCents: 100,
          targetTotalCents: 150,
          highTotalCents: 200,
          createdAt: '2026-08-03T00:00:00Z',
          publishedAt: '2026-08-03T01:00:00Z',
        },
        lines: [{
          id: 'line-1',
          projectRoomId: 'room-1',
          roomName: 'Living Room',
          category: 'Seating',
          lowCents: 100,
          targetCents: 150,
          highCents: 200,
          sortOrder: 0,
        }],
        checkpoint: {
          id: 'checkpoint-1',
          checkpointCode: 'BUD-002',
          status: 'open',
          publishedAt: '2026-08-03T01:00:00Z',
        },
        isPurchaseAuthority: false,
      },
      error: null,
    });
    const query = useWorkingBudget('project-1') as unknown as QueryConfig;

    const result = await query.queryFn();

    expect(result).toMatchObject({
      version: {
        id: 'version-1',
        state: 'published',
        lines: [{ versionId: 'version-1', roomId: 'room-1' }],
      },
      checkpoint: {
        id: 'checkpoint-1',
        projectId: 'project-1',
        versionId: 'version-1',
        state: 'published',
      },
    });
  });

  it('acknowledges a checkpoint without accepting budget or purchasing inputs', async () => {
    const mutation = useAcknowledgeBudgetCheckpoint() as unknown as MutationConfig<{
      projectId: string;
      checkpointId: string;
    }>;

    await mutation.mutationFn({ projectId: 'project-1', checkpointId: 'checkpoint-1' });

    expect(rpc).toHaveBeenCalledWith('acknowledge_budget_checkpoint', {
      p_checkpoint_id: 'checkpoint-1',
    });
  });

  it('writes service drafts through the atomic RPC contract', async () => {
    const mutation = useUpsertDesignServicesDraft() as unknown as MutationConfig<any>;
    await mutation.mutationFn({
      proposalId: 'agreement-1',
      terms: {
        proposalId: 'agreement-1',
        scope: 'Design the main level',
        deliverables: ['Concept', 'Selections'],
        exclusions: ['Construction administration'],
        billingCeilingCents: 2_500_000,
        retainerAmountCents: 500_000,
        retainerActivationPolicy: 'retainer_paid',
        billingCadence: 'monthly',
        currency: 'USD',
        terms: 'Net 15',
        currentRateVersion: 1,
        updatedAt: '2026-08-03T00:00:00Z',
      },
      rates: [{
        id: 'rate-1',
        proposalId: 'agreement-1',
        version: 1,
        roleName: 'Principal Designer',
        hourlyRateCents: 25_000,
        effectiveAt: '2026-08-03T00:00:00Z',
      }],
    });

    expect(rpc).toHaveBeenCalledWith('upsert_design_services_draft', expect.objectContaining({
      p_proposal_id: 'agreement-1',
      p_terms: expect.objectContaining({ scope: 'Design the main level' }),
      p_rates: [{
        roleName: 'Principal Designer',
        hourlyRateCents: 25_000,
        sortOrder: 0,
        effectiveAt: '2026-08-03T00:00:00Z',
      }],
    }));
  });

  it('creates an FF&E authorization draft without notifying the client', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        proposalId: 'wave-1',
        documentId: 'document-1',
        projectId: 'project-1',
        waveName: 'Living level',
        commercialState: 'draft',
        budgetCheckpointId: 'checkpoint-1',
        itemCount: 3,
        documentFingerprint: 'fingerprint-1',
      },
      error: null,
    });
    const mutation = useCreateFurnishingsAuthorization() as unknown as MutationConfig<any>;

    const result = await mutation.mutationFn({
      projectId: 'project-1',
      waveName: 'Living level',
      sourceProposalId: 'source-1',
    });

    expect(rpc).toHaveBeenCalledWith('create_furnishings_authorization', {
      p_project_id: 'project-1',
      p_wave_name: 'Living level',
      p_source_proposal_id: 'source-1',
    });
    expect(result).toMatchObject({
      proposalId: 'wave-1',
      documentId: 'document-1',
      commercialState: 'draft',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sends the exact reviewed commercial fingerprint and persisted dispatch tuple', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        proposalId: 'agreement-1',
        sentAt: '2026-08-03T00:00:00Z',
        proposalSendDispatchId: 'dispatch-1',
      },
      error: null,
    });
    const mutation = useSendCommercialDocument() as unknown as MutationConfig<any>;
    await mutation.mutationFn({
      proposalId: 'agreement-1',
      expectedFingerprint: 'fingerprint-1',
      personalMessage: 'Looking forward to working together.',
    });

    expect(rpc).toHaveBeenCalledWith('send_commercial_document', {
      p_proposal_id: 'agreement-1',
      p_expected_fingerprint: 'fingerprint-1',
      p_personal_message: 'Looking forward to working together.',
      p_valid_until: null,
    });
    expect(invoke).toHaveBeenCalledWith('proposal-send', {
      body: {
        proposalId: 'agreement-1',
        sentAt: '2026-08-03T00:00:00Z',
        dispatchId: 'dispatch-1',
      },
    });
  });
});
