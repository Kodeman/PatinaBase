import { createBrowserClient, getSessionUserId } from '@patina/supabase';
/**
 * US-34 F1 — the subject boundary, wired as providers.tsx wires it: the real
 * session-user store (only Supabase's auth client is faked) driving
 * useSessionSubjectBoundary, with the subtree keyed on its epoch.
 */
import { Fragment, ReactNode, useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useSessionSubjectBoundary } from './use-session-subject-boundary';

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;
type MockChannel = { topic: string; on: () => MockChannel; subscribe: () => MockChannel };

// Plain counters: clearMocks wipes jest.fn() calls between tests, and the
// one-subscription claim spans the whole file.
const mockAuthCounts = { onAuthStateChange: 0, getSession: 0, getUser: 0 };
let mockEmit: AuthCallback | null = null;
/** Whose session the shared auth cookie holds right now. */
let mockStoredUser: string | null = 'user-a';
const mockOpenChannels: MockChannel[] = [];
const mockChannelLog: string[] = [];
const mockRemoveChannel = jest.fn(async (channel: MockChannel) => {
  mockChannelLog.push(`remove ${channel.topic}`);
  const index = mockOpenChannels.indexOf(channel);
  if (index !== -1) mockOpenChannels.splice(index, 1);
  return 'ok';
});

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
    storageKey: 'sb-test-auth-token',
    storage: {
      getItem: async () =>
        mockStoredUser
          ? JSON.stringify({
              access_token: `jwt-${mockStoredUser}`,
              refresh_token: `refresh-${mockStoredUser}`,
              expires_at: 4102444800,
              user: { id: mockStoredUser },
            })
          : null,
    },
  },
  channel: (topic: string): MockChannel => {
    mockChannelLog.push(`channel ${topic}`);
    const channel: MockChannel = {
      topic,
      on: () => channel,
      subscribe: () => {
        mockOpenChannels.push(channel);
        return channel;
      },
    };
    return channel;
  },
  getChannels: () => [...mockOpenChannels],
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
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

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

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

/** Every client the boundary made for a next subject, oldest first. */
const nextClients: QueryClient[] = [];
const nextClient = () => {
  const client = newClient();
  nextClients.push(client);
  return client;
};

/** The client the app last rendered with: the one the current subject reads from. */
let onScreen: QueryClient | null = null;

/** As providers.tsx: the subject's client, with the subtree keyed on its epoch. */
function App({ first, children }: { first: QueryClient; children: ReactNode }) {
  const { client, epoch } = useSessionSubjectBoundary(first, nextClient);
  onScreen = client;
  return (
    <QueryClientProvider client={client}>
      <Fragment key={epoch}>{children}</Fragment>
    </QueryClientProvider>
  );
}

const renderApp = (first: QueryClient, children: ReactNode) =>
  render(<App first={first}>{children}</App>);

/** This tab's own auth event: the cookie and the event agree. */
const setSession = (id: string | null) => {
  mockStoredUser = id;
  mockEmit!(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null);
};
const signInAs = (id: string) => act(() => setSession(id));
const everyCachedValue = (client: QueryClient) =>
  JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data ?? null));

beforeAll(async () => {
  // Seed the store once for the file (getSession resolves user A).
  await getSessionUserId();
});

beforeEach(() => {
  held.clear();
  nextClients.length = 0;
  mockOpenChannels.length = 0;
  mockChannelLog.length = 0;
  // Each test starts as user A; no boundary is mounted yet, so this is silent.
  setSession('user-a');
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('useSessionSubjectBoundary', () => {
  it('user A to user B with no SIGNED_OUT: B reads from a fresh client that holds nothing of A', async () => {
    const first = newClient();
    first.setQueryData(['unwatched'], ['user-a secret']);
    renderApp(first, <Rows />);
    expect(await screen.findByText('user-a row')).toBeInTheDocument();

    signInAs('user-b');

    // A's client is emptied the moment the subject changes, before B's read lands.
    expect(first.getQueryCache().getAll()).toHaveLength(0);
    expect(nextClients).toHaveLength(1);
    const clientB = onScreen!;

    expect(await screen.findByText('user-b row')).toBeInTheDocument();
    expect(screen.queryByText('user-a row')).not.toBeInTheDocument();
    expect(clientB.getQueryData(['rows'])).toEqual(['user-b row']);
    expect(everyCachedValue(clientB)).not.toContain('user-a');
  });

  it('discards a late response for user A that lands after the switch', async () => {
    const first = newClient();
    const lateWatched = holdNextResponse('user-a');
    const lateUnwatched = deferred<string[]>();
    renderApp(first, <Rows />);
    await waitFor(() => expect(fetchRows).toHaveBeenCalledWith('user-a'));
    void first.prefetchQuery({ queryKey: ['background'], queryFn: () => lateUnwatched.promise });

    signInAs('user-b');
    expect(await screen.findByText('user-b row')).toBeInTheDocument();

    await act(async () => {
      lateWatched.resolve(['user-a row']);
      lateUnwatched.resolve(['user-a background']);
    });

    const clientB = onScreen!;
    expect(screen.queryByText('user-a row')).not.toBeInTheDocument();
    expect(screen.getByText('user-b row')).toBeInTheDocument();
    expect(clientB.getQueryData(['rows'])).toEqual(['user-b row']);
    expect(everyCachedValue(clientB)).not.toContain('user-a');
    expect(everyCachedValue(first)).not.toContain('user-a');
  });

  it('sees a cookie another portal swapped when the tab is focused, and fences A', async () => {
    const first = newClient();
    renderApp(first, <Rows />);
    await screen.findByText('user-a row');

    // No auth event reaches this tab: only the shared cookie changed.
    mockStoredUser = 'user-b';
    window.dispatchEvent(new Event('focus'));
    await flush();

    expect(first.getQueryCache().getAll()).toHaveLength(0);
    expect(await screen.findByText('user-b row')).toBeInTheDocument();
    await expect(getSessionUserId()).resolves.toBe('user-b');
  });

  it('a write paused offline under A never runs after a switch to B, even back online', async () => {
    const writes = jest.fn(async (_edit: string, _as: string | null) => 'saved');
    let nextEdit = '';
    function Editor() {
      const save = useMutation({
        mutationFn: async (edit: string) => writes(edit, await getSessionUserId()),
      });
      return <button onClick={() => save.mutate(nextEdit)}>save</button>;
    }
    const first = newClient();
    renderApp(first, <Editor />);

    act(() => onlineManager.setOnline(false));
    nextEdit = 'A profile edit';
    fireEvent.click(screen.getByText('save'));
    await flush();
    expect(first.getMutationCache().getAll()[0]?.state.isPaused).toBe(true);

    signInAs('user-b');
    expect(first.getMutationCache().getAll()).toHaveLength(0);
    nextEdit = 'B profile edit';
    fireEvent.click(screen.getByText('save'));
    await flush();

    await act(async () => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => expect(writes).toHaveBeenCalledTimes(1));
    await flush();

    // B's own paused write resumed, so the online resume ran; A's never did.
    expect(writes.mock.calls).toEqual([['B profile edit', 'user-b']]);
  });

  it("a mutation started under A that settles after the switch writes nothing into B's client", async () => {
    const failedSave = deferred<string>();
    const teachingSave = deferred<string>();
    function Saves() {
      const queryClient = useQueryClient();
      const restore = useMutation({
        mutationFn: () => failedSave.promise,
        // e.g. use-piece-field's rollback of A's product
        onError: () => queryClient.setQueryData(['rows'], ['user-a restored']),
      });
      const teach = useMutation({
        mutationFn: () => teachingSave.promise,
        // e.g. use-teaching-data's write into a user-independent key
        onSuccess: (state) => queryClient.setQueryData(['teaching-state'], state),
      });
      return (
        <button
          onClick={() => {
            restore.mutate();
            teach.mutate();
          }}
        >
          save
        </button>
      );
    }
    renderApp(
      newClient(),
      <>
        <Rows />
        <Saves />
      </>,
    );
    await screen.findByText('user-a row');
    fireEvent.click(screen.getByText('save'));

    signInAs('user-b');
    expect(await screen.findByText('user-b row')).toBeInTheDocument();

    await act(async () => {
      failedSave.reject(new Error('refused'));
      teachingSave.resolve('user-a teaching state');
    });

    const clientB = onScreen!;
    expect(clientB.getQueryData(['rows'])).toEqual(['user-b row']);
    expect(clientB.getQueryData(['teaching-state'])).toBeUndefined();
    expect(everyCachedValue(clientB)).not.toContain('user-a');
    expect(screen.queryByText('user-a restored')).not.toBeInTheDocument();
  });

  it("removes the previous subject's realtime channels", async () => {
    renderApp(newClient(), <Rows />);
    await screen.findByText('user-a row');
    const channels = [mockClient.channel('notification_log:user-a'), mockClient.channel('availability:user-a')];
    channels.forEach((channel) => channel.subscribe());

    signInAs('user-b');

    expect(mockRemoveChannel.mock.calls.map(([channel]) => channel)).toEqual(channels);
  });

  it('re-subscribes a project-notes channel whose effect does not depend on the user', async () => {
    // As useProjectNotesRealtime / useThreadRealtime: keyed on the project only.
    function ProjectNotesRealtime({ projectId }: { projectId: string }) {
      useEffect(() => {
        const supabase = createBrowserClient();
        const channel = supabase
          .channel(`project-notes:${projectId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'project_notes', filter: `project_id=eq.${projectId}` },
            () => {},
          )
          .subscribe();
        return () => {
          void supabase.removeChannel(channel);
        };
      }, [projectId]);
      return null;
    }
    renderApp(newClient(), <ProjectNotesRealtime projectId="p1" />);
    const before = mockOpenChannels[0];
    expect(mockChannelLog).toEqual(['channel project-notes:p1']);

    signInAs('user-b');

    expect(mockChannelLog.filter((entry) => entry.startsWith('channel'))).toHaveLength(2);
    expect(mockChannelLog.indexOf('remove project-notes:p1')).toBeLessThan(
      mockChannelLog.lastIndexOf('channel project-notes:p1'),
    );
    expect(mockOpenChannels.map((channel) => channel.topic)).toEqual(['project-notes:p1']);
    expect(mockOpenChannels[0]).not.toBe(before);
  });

  it('on sign-out remounts on a fresh client and never fetches for A again', async () => {
    const first = newClient();
    renderApp(first, <Rows />);
    await screen.findByText('user-a row');
    fetchRows.mockClear();

    act(() => setSession(null));

    expect(first.getQueryCache().getAll()).toHaveLength(0);
    await waitFor(() => expect(screen.queryByText('user-a row')).not.toBeInTheDocument());
    expect(nextClients).toHaveLength(1);
    expect(everyCachedValue(onScreen!)).not.toContain('user-a');
    expect(fetchRows).not.toHaveBeenCalledWith('user-a');
  });

  it('the first sign-in keeps the client, the mount and open channels, and reads again', async () => {
    setSession(null);
    let mounts = 0;
    function Mounted() {
      const [mount] = useState(() => ++mounts);
      return <p>mount {mount}</p>;
    }
    const first = newClient();
    renderApp(
      first,
      <>
        <Mounted />
        <Rows />
      </>,
    );
    await waitFor(() => expect(fetchRows).toHaveBeenCalledWith(null));
    mockClient.channel('signed-out').subscribe();

    signInAs('user-a');

    expect(await screen.findByText('user-a row')).toBeInTheDocument();
    expect(nextClients).toHaveLength(0);
    expect(first.getQueryData(['rows'])).toEqual(['user-a row']);
    expect(screen.getByText('mount 1')).toBeInTheDocument();
    expect(mockRemoveChannel).not.toHaveBeenCalled();
  });

  it('runs on one auth subscription and never asks getUser()', () => {
    expect(mockAuthCounts.onAuthStateChange).toBe(1);
    expect(mockAuthCounts.getSession).toBe(1);
    expect(mockAuthCounts.getUser).toBe(0);
  });
});
