/**
 * US-34 F1 — the subject boundary, wired as the portal wires it: the real
 * session-user store (only Supabase's auth client is faked) driving a real
 * QueryClient through useSessionSubjectBoundary.
 */
import { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { getSessionUserId } from '@patina/supabase';
import { useSessionSubjectBoundary } from './use-session-subject-boundary';

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;

// Plain counters: clearMocks wipes jest.fn() calls between tests, and the
// one-subscription claim spans the whole file.
const mockAuthCounts = { onAuthStateChange: 0, getSession: 0, getUser: 0 };
let mockEmit: AuthCallback | null = null;
const mockChannels: Array<{ topic: string }> = [];
const mockRemoveChannel = jest.fn(async (_channel: unknown) => 'ok');

const mockClient = {
  auth: {
    onAuthStateChange: (cb: AuthCallback) => {
      mockAuthCounts.onAuthStateChange += 1;
      mockEmit = cb;
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    getSession: async () => {
      mockAuthCounts.getSession += 1;
      return { data: { session: { user: { id: 'user-a' } } } };
    },
    getUser: async () => {
      mockAuthCounts.getUser += 1;
      return { data: { user: null } };
    },
  },
  getChannels: () => [...mockChannels],
  removeChannel: mockRemoveChannel,
};

// The store imports the package's client module directly.
jest.mock('../../../../packages/supabase/src/client', () => ({
  createBrowserClient: () => mockClient,
}));
jest.mock('@patina/supabase', () => {
  const store = jest.requireActual('../../../../packages/supabase/src/auth/session-user');
  return {
    getSessionUserId: store.getSessionUserId,
    onSessionSubjectChange: store.onSessionSubjectChange,
    createBrowserClient: () => mockClient,
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** The server: rows for whoever asks, or a held response when queued. */
const held = new Map<string, Array<ReturnType<typeof deferred<string[]>>>>();
const fetchRows = jest.fn(async (userId: string | null): Promise<string[]> => {
  const queue = held.get(String(userId));
  const next = queue?.shift();
  if (next) return next.promise;
  return userId ? [`${userId} row`] : [];
});
function holdNextResponse(userId: string) {
  const d = deferred<string[]>();
  held.set(userId, [...(held.get(userId) ?? []), d]);
  return d;
}

function Rows() {
  const { data } = useQuery({
    queryKey: ['rows'],
    queryFn: async () => fetchRows(await getSessionUserId()),
  });
  return (
    <ul>
      {(data ?? []).map((row) => (
        <li key={row}>{row}</li>
      ))}
    </ul>
  );
}

function Wired({ client, children }: { client: QueryClient; children: ReactNode }) {
  useSessionSubjectBoundary(client);
  return <>{children}</>;
}

function renderWired(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <Wired client={client}>
        <Rows />
      </Wired>
    </QueryClientProvider>,
  );
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

const signInAs = (id: string) => act(() => mockEmit!('SIGNED_IN', { user: { id } }));
const everyCachedValue = (client: QueryClient) =>
  JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data ?? null));

beforeAll(async () => {
  // Seed the store once for the file (getSession resolves user A).
  await getSessionUserId();
});

beforeEach(() => {
  held.clear();
  mockChannels.length = 0;
  // Each test starts as user A; no boundary is mounted yet, so this is silent.
  mockEmit!('SIGNED_IN', { user: { id: 'user-a' } });
});

describe('useSessionSubjectBoundary', () => {
  it('user A to user B with no SIGNED_OUT: no A rows on screen or in the cache', async () => {
    const client = newClient();
    client.setQueryData(['unwatched'], ['user-a secret']);
    renderWired(client);
    expect(await screen.findByText('user-a row')).toBeInTheDocument();

    signInAs('user-b');

    // The cache is clean the moment the subject changes, before B's read lands.
    expect(client.getQueryData(['rows'])).toBeUndefined();
    expect(client.getQueryData(['unwatched'])).toBeUndefined();
    expect(everyCachedValue(client)).not.toContain('user-a');

    expect(await screen.findByText('user-b row')).toBeInTheDocument();
    expect(screen.queryByText('user-a row')).not.toBeInTheDocument();
    expect(everyCachedValue(client)).not.toContain('user-a');
  });

  it('discards a late response for user A that lands after the switch', async () => {
    const client = newClient();
    const lateWatched = holdNextResponse('user-a');
    const lateUnwatched = deferred<string[]>();
    renderWired(client);
    await waitFor(() => expect(fetchRows).toHaveBeenCalledWith('user-a'));
    void client.prefetchQuery({ queryKey: ['background'], queryFn: () => lateUnwatched.promise });

    signInAs('user-b');
    expect(await screen.findByText('user-b row')).toBeInTheDocument();

    await act(async () => {
      lateWatched.resolve(['user-a row']);
      lateUnwatched.resolve(['user-a background']);
    });

    expect(screen.queryByText('user-a row')).not.toBeInTheDocument();
    expect(screen.getByText('user-b row')).toBeInTheDocument();
    expect(client.getQueryData(['rows'])).toEqual(['user-b row']);
    expect(client.getQueryData(['background'])).toBeUndefined();
  });

  it("removes the previous subject's realtime channels", async () => {
    const client = newClient();
    renderWired(client);
    await screen.findByText('user-a row');
    mockChannels.push({ topic: 'notification_log:user-a' }, { topic: 'availability:user-a' });

    signInAs('user-b');

    expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
    expect(mockRemoveChannel.mock.calls.map(([channel]) => channel)).toEqual(mockChannels);
  });

  it('on sign-out clears everything and fetches nothing for nobody', async () => {
    const client = newClient();
    renderWired(client);
    await screen.findByText('user-a row');
    fetchRows.mockClear();

    act(() => mockEmit!('SIGNED_OUT', null));

    expect(everyCachedValue(client)).not.toContain('user-a');
    await waitFor(() => expect(screen.queryByText('user-a row')).not.toBeInTheDocument());
    expect(fetchRows).not.toHaveBeenCalled();
  });

  it('runs on one auth subscription and never asks getUser()', () => {
    expect(mockAuthCounts.onAuthStateChange).toBe(1);
    expect(mockAuthCounts.getSession).toBe(1);
    expect(mockAuthCounts.getUser).toBe(0);
  });
});
