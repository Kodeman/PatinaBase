import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import {
  useClientCommercialDocument,
  useProjectCommercialSummary,
} from '../use-commercial-client';

jest.mock('@patina/supabase', () => ({ createBrowserClient: jest.fn() }));

const mockCreateBrowserClient = createBrowserClient as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}

describe('commercial client hooks', () => {
  it('loads a commercial bundle through the database-owned allowlist RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        document: { id: 'ds-1', documentKind: 'design_services', commercialState: 'sent', title: 'Agreement' },
        serviceTerms: { billingCeilingCents: 100_000, currency: 'USD' },
      },
      error: null,
    });
    mockCreateBrowserClient.mockReturnValue({ rpc });

    const { result } = renderHook(() => useClientCommercialDocument('ds-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('get_client_commercial_document_bundle', {
      p_proposal_id: 'ds-1',
    });
    expect(result.current.data?.document.kind).toBe('design_services');
  });

  it('loads the three project shells without querying raw time entries', async () => {
    const rpc = jest.fn().mockImplementation((name: string) => {
      if (name === 'get_project_authority_summary') {
        return Promise.resolve({ data: { id: 'a1', projectId: 'p1', agreementId: 'ds1', state: 'active' }, error: null });
      }
      if (name === 'get_project_working_budget') {
        return Promise.resolve({ data: { id: 'b1', projectId: 'p1', targetTotalCents: 50_000 }, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });
    mockCreateBrowserClient.mockReturnValue({ rpc });

    const { result } = renderHook(() => useProjectCommercialSummary('p1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_project_authority_summary',
      'get_project_working_budget',
      'list_furnishings_authorizations',
    ]);
    expect(result.current.data?.authority?.id).toBe('a1');
  });
});
