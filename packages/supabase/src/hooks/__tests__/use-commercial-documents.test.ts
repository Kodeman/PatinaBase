import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc }),
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
});
