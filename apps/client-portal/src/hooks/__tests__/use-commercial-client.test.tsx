import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { commercialKeys, createBrowserClient } from '@patina/supabase';
import {
  clientPlanKey,
  clientReviewKey,
  clientSelectionsKey,
  invalidateSignedCommercialDocument,
  useClientCommercialDocument,
  useClientPlan,
  useClientProjectReviewBundle,
  useClientSelections,
  useRecordProjectReviewFeedback,
  useDeclineCommercialDocument,
  useProjectCommercialSummary,
  useProjectWorkingBudget,
} from '../use-commercial-client';

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
  commercialKeys: {
    clientBundle: (id: string) => ['commercial-documents', id, 'client-safe'],
    budget: (id: string) => ['working-budget', id],
    waves: (id: string) => ['furnishings-authorizations', id],
  },
}));

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

  it('uses the canonical shared commercial-document query key', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { document: { id: 'ds-1', kind: 'design_services', state: 'sent' } },
      error: null,
    });
    mockCreateBrowserClient.mockReturnValue({ rpc });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const canonicalWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useClientCommercialDocument('ds-1'), {
      wrapper: canonicalWrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(commercialKeys.clientBundle('ds-1'))).toEqual(result.current.data);
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

  it('loads only the working budget with the canonical budget key', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        id: 'b1',
        projectId: 'p1',
        version: 3,
        targetTotalCents: 50_000,
        checkpoint: { evidenceFingerprint: 'fingerprint-1' },
      },
      error: null,
    });
    mockCreateBrowserClient.mockReturnValue({ rpc });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const canonicalWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useProjectWorkingBudget('p1'), {
      wrapper: canonicalWrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_project_working_budget', {
      p_project_id: 'p1',
    });
    expect(queryClient.getQueryData(commercialKeys.budget('p1'))).toEqual(
      result.current.data,
    );
    expect(result.current.data?.checkpoint?.evidenceFingerprint).toBe(
      'fingerprint-1',
    );
  });

  it('invalidates proposal, list, commercial, and project projections after signing', async () => {
    const queryClient = new QueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateSignedCommercialDocument(queryClient, 'ffe-1', 'project-1');

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: commercialKeys.clientBundle('ffe-1'),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['proposal', 'ffe-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['proposals'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['project-commercial-summary', 'project-1'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: commercialKeys.waves('project-1'),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientSelectionsKey('project-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientPlanKey('project-1') });
  });

  it('skips project-scoped invalidation (including selections/plan) when no projectId is known', async () => {
    const queryClient = new QueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateSignedCommercialDocument(queryClient, 'ffe-1', null);

    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: clientSelectionsKey(expect.any(String)) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: clientPlanKey(expect.any(String)) });
  });

  it('loads client selections keyed by project and adapts origin + selections', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        origin: 'commercial',
        selections: [
          {
            id: 'sel-1',
            name: 'Meadow linen sectional',
            roomId: 'room-1',
            roomName: 'Living room',
            quantity: 1,
            clientUnitPriceCents: 480_000,
            clientLineTotalCents: 480_000,
            itemType: 'furniture',
            logisticsStatus: 'ordered',
            allowance: null,
            instrument: { documentId: 'doc-1', name: 'Furnishings authorization', executedAt: '2026-08-01' },
            productId: 'prod-1',
            imageUrl: 'https://example.com/sofa.jpg',
            docCode: 'FA-001',
          },
        ],
      },
      error: null,
    });
    mockCreateBrowserClient.mockReturnValue({ rpc });

    const { result } = renderHook(() => useClientSelections('project-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('get_client_project_selections', { p_project_id: 'project-1' });
    expect(result.current.data?.origin).toBe('commercial');
    expect(result.current.data?.selections).toHaveLength(1);
    expect(result.current.data?.selections[0].name).toBe('Meadow linen sectional');
    expect(result.current.data?.selections[0].logisticsStatus).toBe('ordered');
  });

  it('uses the client-selections key so callers can target the same cache entry', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { origin: 'legacy', selections: [] }, error: null });
    mockCreateBrowserClient.mockReturnValue({ rpc });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const canonicalWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useClientSelections('project-1'), { wrapper: canonicalWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(clientSelectionsKey('project-1'))).toEqual(result.current.data);
  });

  it('loads one immutable edition and resolves its media through the authenticated edge function', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        edition: { id: 'edition-1', status: 'published' },
        project: { id: 'project-1' },
        items: [{ id: 'review-item-1', snapshot: { name: 'Chair', media: [{ id: 'asset-1' }] }, feedback: [] }],
      },
      error: null,
    });
    const invoke = jest.fn().mockResolvedValue({
      data: { urls: [{ assetId: 'asset-1', signedUrl: 'https://signed.example/chair' }] },
      error: null,
    });
    mockCreateBrowserClient.mockReturnValue({ rpc, functions: { invoke } });

    const { result } = renderHook(() => useClientProjectReviewBundle('edition-1', 'project-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('get_client_project_review_bundle', { p_edition_id: 'edition-1' });
    expect(invoke).toHaveBeenCalledWith('project-review-media', { body: { editionId: 'edition-1' } });
    expect(result.current.data?.items[0].imageUrl).toBe('https://signed.example/chair');
  });

  it('records feedback against the immutable review item contract and invalidates its edition', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { feedbackId: 'feedback-1' }, error: null });
    mockCreateBrowserClient.mockReturnValue({ rpc });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const mutationWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRecordProjectReviewFeedback('edition-1'), { wrapper: mutationWrapper });
    await result.current.mutateAsync({ reviewItemId: 'review-item-1', verdict: 'comment', comment: '  Lighter?  ' });

    expect(rpc).toHaveBeenCalledWith('record_project_review_feedback', {
      p_review_item_id: 'review-item-1', p_verdict: 'comment', p_body: 'Lighter?',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientReviewKey('edition-1') });
  });

  it('loads the client plan grid keyed by project and adapts published-checkpoint lines', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        version: { id: 'v1', projectId: 'project-1', version: 2, publishedAt: '2026-08-01T00:00:00Z' },
        lines: [
          {
            id: 'line-1',
            roomName: 'Living room',
            category: 'Seating',
            targetCents: 500_000,
            scheduledCents: 480_000,
            authorizedCents: 480_000,
          },
        ],
        checkpoint: null,
      },
      error: null,
    });
    mockCreateBrowserClient.mockReturnValue({ rpc });

    const { result } = renderHook(() => useClientPlan('project-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('get_project_working_budget', { p_project_id: 'project-1' });
    expect(result.current.data?.publishedAt).toBe('2026-08-01T00:00:00Z');
    expect(result.current.data?.rooms).toEqual(['Living room']);
    expect(result.current.data?.lines[0].authorizedCents).toBe(480_000);
  });

  it('returns null from the client plan when the project has no published version', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockCreateBrowserClient.mockReturnValue({ rpc });

    const { result } = renderHook(() => useClientPlan('project-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });

  it('declines a commercial document through the dedicated route and invalidates its projections', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: 'ds-1', status: 'declined', declinedAt: '2026-08-04T00:00:00Z' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const canonicalWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDeclineCommercialDocument('ds-1', 'project-1'), {
      wrapper: canonicalWrapper,
    });

    result.current.mutate('Changed my mind');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/proposals/ds-1/decline', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ reason: 'Changed my mind' }),
    }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientSelectionsKey('project-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientPlanKey('project-1') });

    global.fetch = originalFetch;
  });

  it('surfaces the route error message when decline fails', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'not_found' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useDeclineCommercialDocument('ds-1', 'project-1'), { wrapper });

    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('not_found');

    global.fetch = originalFetch;
  });
});
