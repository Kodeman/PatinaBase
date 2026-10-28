import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { focusManager, QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { nextSubjectQueryClient } from '@/lib/react-query';

/**
 * SQ-2279's two residuals, under the REAL hook module, the REAL designer
 * QueryClient (one per signed-in subject) and TanStack's own timers; only the
 * Supabase client is a fixture.
 */
type Answer = { data: unknown; error: unknown };
const mockSupabase = {
  rpc: jest.fn<Promise<Answer>, [string, Record<string, unknown>]>(),
  /** Whether the cited document is still stored, and whether listing fails. */
  stored: { present: true, failing: false },
  lists: 0,
};
jest.mock('../../../../../../../packages/supabase/src/client', () => ({
  createBrowserClient: () => {
    const query: Record<string, unknown> = {};
    for (const step of ['select', 'eq', 'order', 'range']) query[step] = () => query;
    query.maybeSingle = async () => ({ data: null, error: null });
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return {
      rpc: (name: string, args: Record<string, unknown>) => mockSupabase.rpc(name, args),
      from: () => query,
      storage: {
        from: (bucket: string) => ({
          list: async (prefix: string) => {
            mockSupabase.lists += 1;
            if (mockSupabase.stored.failing) return { data: null, error: { code: 'XX000', message: 'storage unavailable' } };
            const here = bucket === 'project-documents' && prefix === 'job-1' && mockSupabase.stored.present;
            return { data: here ? [{ id: 'object-1', name: 'walkthrough.pdf' }] : [], error: null };
          },
        }),
      },
    };
  },
}));
// The section reads the real completion hooks; the job's other reads are fixtures.
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('../../../../../../../packages/supabase/src/hooks/use-service-completion'),
  useScopeEditions: () => ({ data: [] }),
  useServiceAcceptance: () => ({ data: { projectId: 'job-1', capability: 'active', requests: [] } }),
  useProjectV2: () => ({ data: { id: 'job-1', studio_id: 'studio-1' } }),
  useOrganizations: () => ({ data: [] }),
  isServiceAcceptanceInactive: (error: { message?: string }) => /permission denied for function/.test(error?.message ?? ''),
}));
jest.mock('../../paper/unfold-bridge', () => ({ unfoldOpenerFor: () => null }));

import { useServiceConditionCitation } from '../../../../../../../packages/supabase/src/hooks/use-service-completion';
import { StudioServiceSection } from '../studio-service-section';

const reading = {
  projectId: 'job-1', capability: 'active', scopeEditionId: 'edition-1', obligationHash: 'hash-1',
  blockers: [], informational: [], conditions: [],
  acceptance: { requestId: 'request-1', outcome: 'accepted', pendingRequiredSigners: [] },
  financialHold: { openInvoiceCount: 0, balanceCents: 0, uncollectedContractCents: 0 },
};
const record = { projectId: 'job-1', audience: 'studio', capability: 'active', completions: [], resolutions: [] };

const clients: QueryClient[] = [];
function subject(): QueryClient {
  const client = nextSubjectQueryClient();
  client.setQueryDefaults(['service-completion'], { retry: false });
  clients.push(client);
  return client;
}
const within = (client: QueryClient) => ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockSupabase.stored = { present: true, failing: false };
  mockSupabase.lists = 0;
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  focusManager.setFocused(undefined);
  jest.useRealTimers();
});

describe('F1: the stale mark belongs to the QueryClient its act ran in', () => {
  it('a late stale refusal from client A after A.clear() does not hold Complete for client B on the same job', async () => {
    // jsdom has no crypto.randomUUID; the act mints its client_request_id with it.
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => 'request-key-1' });
    let refuse: (answer: Answer) => void = () => undefined;
    mockSupabase.rpc.mockImplementation(async (name) => {
      if (name === 'derive_studio_service_obligations') return { data: reading, error: null };
      if (name === 'get_studio_service_completion') return { data: record, error: null };
      return new Promise<Answer>((resolve) => { refuse = resolve; });
    });
    const completeButton = () => screen.getByRole('button', { name: 'Complete studio service' });
    // Subject A reads the job and starts Complete, then signs out before the server answers.
    const clientA = subject();
    const first = render(<StudioServiceSection projectId="job-1" />, { wrapper: within(clientA) });
    await waitFor(() => expect(completeButton()).toBeEnabled());
    fireEvent.click(completeButton());
    await waitFor(() => expect(mockSupabase.rpc).toHaveBeenCalledWith('complete_studio_service', expect.anything()));
    first.unmount();
    clientA.clear();
    // Subject B reads the same job in its own QueryClient.
    const clientB = subject();
    const second = render(<StudioServiceSection projectId="job-1" />, { wrapper: within(clientB) });
    await waitFor(() => expect(completeButton()).toBeEnabled());
    // A's act is refused late as stale.
    await act(async () => {
      refuse({ data: null, error: { code: '40001', message: 'stale_obligations' } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    second.rerender(<StudioServiceSection projectId="job-1" />);
    expect(completeButton()).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Check the list again' })).toBeNull();
  });
});

describe('F2: a mounted stored citation stays within two minutes of the store', () => {
  const TWO_MINUTES = 2 * 60 * 1000;
  // Read as the Citation reader does: its failed state, then its answer.
  const cite = (client: QueryClient) => renderHook(() => {
    const citation = useServiceConditionCitation('job-1', 'storageObject', 'object-1');
    return { isError: citation.isError, data: citation.data };
  }, { wrapper: within(client) });

  it('the reviewer\'s scenario: a document deleted while its citation is mounted reads gone after the bound', async () => {
    jest.useFakeTimers();
    const { result } = cite(subject());
    await waitFor(() => expect(result.current.data).toEqual({ available: true, label: 'walkthrough.pdf' }));
    mockSupabase.stored.present = false;
    await act(async () => { await jest.advanceTimersByTimeAsync(TWO_MINUTES + 1000); });
    await waitFor(() => expect(result.current.data).toEqual({ available: false }));
  });

  it('never walks while the tab is hidden, and walks again when the window regains focus', async () => {
    jest.useFakeTimers();
    const { result } = cite(subject());
    await waitFor(() => expect(result.current.data).toEqual({ available: true, label: 'walkthrough.pdf' }));
    act(() => focusManager.setFocused(false));
    const walked = mockSupabase.lists;
    mockSupabase.stored.present = false;
    await act(async () => { await jest.advanceTimersByTimeAsync(5 * TWO_MINUTES); });
    expect(mockSupabase.lists).toBe(walked);
    expect(result.current.data).toEqual({ available: true, label: 'walkthrough.pdf' });
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(result.current.data).toEqual({ available: false }));
  });

  it('a failed walk after the bound is an error over the cached answer (R2), never available', async () => {
    jest.useFakeTimers();
    const { result } = cite(subject());
    await waitFor(() => expect(result.current.data).toEqual({ available: true, label: 'walkthrough.pdf' }));
    mockSupabase.stored.failing = true;
    await act(async () => { await jest.advanceTimersByTimeAsync(TWO_MINUTES + 1000); });
    // The cached "available" is still held, but the failed check is what the reader shows.
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual({ available: true, label: 'walkthrough.pdf' });
  });
});
