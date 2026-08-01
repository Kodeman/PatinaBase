import { useState } from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import {
  useDraftingState,
  useDraftingWritesPending,
} from './use-drafting-state';

const mockCreateBrowserClient = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => mockCreateBrowserClient(),
}));

function emptyFacetClient() {
  const from = jest.fn((table: string) => {
    const response = {
      data: table === 'proposal_change_order_terms' ? null : [],
      error: null,
    };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order']) {
      builder[method] = jest.fn(() => builder);
    }
    builder.maybeSingle = jest.fn(() => Promise.resolve(response));
    builder.then = (
      resolve: (value: typeof response) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(response).then(resolve, reject);
    return builder;
  });
  return { client: { from }, from };
}

function FeedbackHarness() {
  const [releaseQuery, setReleaseQuery] = useState<(() => void) | null>(null);
  const [releaseMutation, setReleaseMutation] = useState<(() => void) | null>(null);

  useQuery({
    queryKey: ['drafting-facets', 'proposal-1'],
    queryFn: () =>
      new Promise<unknown[]>((resolve) =>
        setReleaseQuery(() => () => resolve([])),
      ),
  });
  const mutation = useMutation({
    mutationFn: (_variables: { proposalId: string }) =>
      new Promise<void>((resolve) => setReleaseMutation(() => resolve)),
  });
  const writePending = useDraftingWritesPending('proposal-1');

  return (
    <>
      <span aria-live="polite">
        {writePending ? 'Saving proposal changes…' : ''}
      </span>
      <button
        type="button"
        onClick={() => mutation.mutate({ proposalId: 'proposal-1' })}
      >
        Start explicit write
      </button>
      <button type="button" onClick={() => releaseQuery?.()}>
        Finish query
      </button>
      <button type="button" onClick={() => releaseMutation?.()}>
        Finish write
      </button>
    </>
  );
}

describe('drafting mutation feedback', () => {
  beforeEach(() => {
    mockCreateBrowserClient.mockReset();
  });

  it('keeps background reads silent and announces only an explicit write', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <FeedbackHarness />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(queryClient.isFetching()).toBe(1));
    expect(screen.queryByText('Saving proposal changes…')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start explicit write' }));
    expect(await screen.findByText('Saving proposal changes…')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Finish write' }));
    await waitFor(() =>
      expect(screen.queryByText('Saving proposal changes…')).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish query' }));
  });

  it('does not poll and returns completeness derived from a canonical refetch', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { client, from } = emptyFacetClient();
    mockCreateBrowserClient.mockReturnValue(client);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useDraftingState('proposal-1'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFetching).toBe(false);
    expect(
      queryClient.getQueryCache().find({
        queryKey: ['drafting-facets', 'proposal-1'],
      })?.options.refetchInterval,
    ).toBeUndefined();

    from.mockClear();
    let refreshed: Awaited<ReturnType<typeof result.current.refresh>> | undefined;
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(from).toHaveBeenCalledTimes(8);
    expect(refreshed).toEqual({
      facets: {
        rooms: false,
        ffe: false,
        phases: false,
        exclusions: false,
        payments: false,
        terms: false,
        palette: false,
        boards: false,
      },
      state: 'Outline',
      gaps: [
        'rooms in scope',
        'an FF&E schedule',
        'phases & fees',
        'exclusions',
        'a payment schedule',
        'change-order terms',
        'a palette',
        'mood boards',
      ],
    });
  });
});
