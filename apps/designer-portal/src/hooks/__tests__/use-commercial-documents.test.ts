const rpc = jest.fn();
const invoke = jest.fn();
const invalidateQueries = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ rpc, functions: { invoke } }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries, setQueryData: jest.fn() }),
}));

import { useCountersignDesignServicesAgreement } from '../use-commercial-documents';

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
});
