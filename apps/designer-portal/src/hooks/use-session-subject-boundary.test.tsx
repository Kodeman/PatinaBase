import { createBrowserClient, getSessionUserId, useSessionUserId } from '@patina/supabase';
/**
 * US-34 F1 — the subject boundary, wired as providers.tsx wires it: the real
 * session-user store (only Supabase's auth client is faked) driving
 * useSessionSubjectBoundary, with the subtree keyed on its epoch.
 */
import { Fragment, ReactNode, useEffect, useState } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { RealtimeClient } from '@supabase/supabase-js';
import { toast, useToast } from '@patina/design-system';
import { DismissPreviousSubjectToasts, useSessionSubjectBoundary } from './use-session-subject-boundary';
import { useBufferedAutosave } from './use-buffered-autosave';
import { nextSubjectQueryClient, SubjectChangedError } from '@/lib/react-query';
import { setToastFunction } from '@/lib/error-handler';
import { forThisSubject } from '@/lib/analytics/subject';
import {
  parkInvoiceComposer,
  parkedInvoiceComposer,
  subscribeParkedInvoiceComposers,
} from '@/lib/document/registry';
import type { ParkedInvoiceComposer } from '@/lib/document/invoice-composer';
import {
  ReturnToLeadUndo,
  offerReturnToLeadUndo,
} from '@/components/document/return-to-lead-undo';
import {
  flushProposalAutosaves,
  getProposalAutosaveSnapshot,
  resetProposalAutosaveRegistryForTests,
} from '@/lib/proposal-autosave-registry';

type AuthCallback = (
  event: string,
  session: { user: { id: string }; access_token: string } | null,
) => void;
type MockChannel = { topic: string; on: () => MockChannel; subscribe: () => MockChannel };

// Plain counters: clearMocks wipes jest.fn() calls between tests, and the
// one-subscription claim spans the whole file.
const mockAuthCounts = { onAuthStateChange: 0, getSession: 0, getUser: 0 };
let mockEmit: AuthCallback | null = null;
/** Whose session the shared auth cookie holds right now. */
let mockStoredUser: string | null = 'user-a';
/** How many times another portal has refreshed that session's JWT. */
let mockRefreshes = 0;
const mockJwt = (id: string) => (mockRefreshes ? `jwt-${id}-r${mockRefreshes}` : `jwt-${id}`);
const mockOpenChannels: MockChannel[] = [];
const mockChannelLog: string[] = [];
/** "<topic> <token>": the token Realtime held when each channel subscribed. */
const mockSubscribedAs: string[] = [];
// The real realtime-js client; its token callback answers as supabase-js's
// _getAccessToken does, from the stored session or else the anon key.
const mockRealtime = new RealtimeClient('ws://realtime.test/realtime/v1', {
  params: { apikey: 'anon-key' },
  accessToken: async () => (mockStoredUser ? mockJwt(mockStoredUser) : 'anon-key'),
});
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
              access_token: mockJwt(mockStoredUser),
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
        mockSubscribedAs.push(`${topic} ${mockRealtime.accessTokenValue}`);
        return channel;
      },
    };
    return channel;
  },
  getChannels: () => [...mockOpenChannels],
  removeChannel: mockRemoveChannel,
  realtime: mockRealtime,
};

// The store imports the package's client module directly.
jest.mock('../../../../packages/supabase/src/client', () => ({
  createBrowserClient: () => mockClient,
}));
jest.mock('@patina/supabase', () => {
  const store = jest.requireActual('../../../../packages/supabase/src/auth/session-user');
  return {
    getSessionUserId: store.getSessionUserId,
    useSessionUserId: store.useSessionUserId,
    onSessionSubjectChange: store.onSessionSubjectChange,
    createBrowserClient: () => mockClient,
    useReturnToLead: () => ({ mutate: jest.fn(), isPending: false }),
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
function App({
  first,
  next = nextClient,
  children,
}: {
  first: QueryClient;
  next?: () => QueryClient;
  children: ReactNode;
}) {
  const { client, epoch } = useSessionSubjectBoundary(first, next);
  onScreen = client;
  return (
    <QueryClientProvider client={client}>
      <Fragment key={epoch}>{children}</Fragment>
      <DismissPreviousSubjectToasts epoch={epoch} />
    </QueryClientProvider>
  );
}

/** As useProjectNotesRealtime: a channel whose effect does not depend on the user. */
function ProjectNotesChannel() {
  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase.channel('project-notes:p1').subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
  return null;
}

/** As the Toaster: outside the epoch, reading the design-system toast store. */
function OpenToasts() {
  const { toasts } = useToast();
  return (
    <ul>
      {toasts
        .filter((shown) => shown.open)
        .map((shown) => (
          <li key={shown.id}>{shown.title}</li>
        ))}
    </ul>
  );
}

const renderApp = (first: QueryClient, children: ReactNode) =>
  render(<App first={first}>{children}</App>);

/** With the portal's own clients (lib/react-query), as providers.tsx passes them. */
const renderPortal = (children: ReactNode) =>
  render(
    <App first={nextSubjectQueryClient()} next={nextSubjectQueryClient}>
      {children}
    </App>,
  );

/** This tab's own auth event: the cookie and the event agree. */
const setSession = (id: string | null) => {
  mockStoredUser = id;
  mockEmit!(
    id ? 'SIGNED_IN' : 'SIGNED_OUT',
    id ? { user: { id }, access_token: `jwt-${id}` } : null,
  );
};
const signInAs = (id: string) => act(() => setSession(id));
const everyCachedValue = (client: QueryClient) =>
  JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data ?? null));

beforeAll(async () => {
  // Seed the store once for the file (getSession resolves user A).
  await getSessionUserId();
});

const mockToast = jest.fn();

beforeEach(() => {
  held.clear();
  nextClients.length = 0;
  mockOpenChannels.length = 0;
  mockChannelLog.length = 0;
  mockSubscribedAs.length = 0;
  mockRefreshes = 0;
  setToastFunction(mockToast);
  // Each test starts as user A; no boundary is mounted yet, so this is silent.
  setSession('user-a');
  // As supabase-js leaves it after A's SIGNED_IN: A's token, set by hand.
  void mockRealtime.setAuth('jwt-user-a');
});

afterEach(() => {
  onlineManager.setOnline(true);
  resetProposalAutosaveRegistryForTests();
});

describe('useSessionSubjectBoundary', () => {
  const parkedComposer: ParkedInvoiceComposer = {
    milestoneIds: [],
    timeEntryIds: [],
    ffeItemIds: [],
    ffeStage: 'full',
    depositPctText: '',
    balanceItemIds: [],
    purchaseIds: [],
    riderIds: [],
    overrides: [],
    adhoc: [],
    taxRatePercent: '',
    termsDays: '',
    memo: 'A private invoice note',
  };

  it('clears parked invoice composers and notifies once when the subject changes', async () => {
    const first = newClient();
    renderApp(first, <Rows />);
    await screen.findByText('user-a row');
    parkInvoiceComposer('project-a', parkedComposer);
    const listener = jest.fn();
    const unsubscribe = subscribeParkedInvoiceComposers(listener);

    signInAs('user-b');

    expect(parkedInvoiceComposer('project-a')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('keeps parked invoice composers on a same-subject token refresh', async () => {
    renderApp(newClient(), <Rows />);
    await screen.findByText('user-a row');
    parkInvoiceComposer('project-a', parkedComposer);

    act(() => mockEmit!('TOKEN_REFRESHED', { user: { id: 'user-a' }, access_token: 'jwt-user-a-r1' }));

    expect(parkedInvoiceComposer('project-a')).toBe(parkedComposer);
  });

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
    // Followed once the read that confirms it agrees, 300 ms on.
    await waitFor(() => expect(first.getQueryCache().getAll()).toHaveLength(0));

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

  it('a write that fails under A and would retry does not run again after the switch', async () => {
    const failed = deferred<void>();
    const writes = jest.fn(async (_edit: string, _as: string | null): Promise<string> => {
      failed.resolve();
      throw new Error('network request failed');
    });
    let outcome: unknown;
    function Editor() {
      // The portal's default retry: one more try for a network error.
      const save = useMutation({
        mutationFn: async (edit: string) => writes(edit, await getSessionUserId()),
        retryDelay: 200,
      });
      return (
        <button onClick={() => save.mutateAsync('A profile edit').catch((error) => (outcome = error))}>
          save
        </button>
      );
    }
    renderPortal(<Editor />);
    fireEvent.click(screen.getByText('save'));
    await act(async () => failed.promise);
    await flush();

    // The retry is asleep when the subject changes.
    signInAs('user-b');

    await waitFor(() => expect(outcome).toBeInstanceOf(SubjectChangedError));
    expect(writes.mock.calls).toEqual([['A profile edit', 'user-a']]);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('a write whose onMutate is pending at the switch never calls its mutationFn', async () => {
    const writes = jest.fn(async (_edit: string, _as: string | null) => 'saved');
    const prepared = deferred<void>();
    let outcome: unknown;
    function Editor() {
      const save = useMutation({
        // e.g. an optimistic write that first cancels its row's reads
        onMutate: () => prepared.promise,
        mutationFn: async (edit: string) => writes(edit, await getSessionUserId()),
      });
      return (
        <button onClick={() => save.mutateAsync('A profile edit').catch((error) => (outcome = error))}>
          save
        </button>
      );
    }
    renderPortal(<Editor />);
    fireEvent.click(screen.getByText('save'));
    await flush();

    signInAs('user-b');
    await act(async () => prepared.resolve());

    await waitFor(() => expect(outcome).toBeInstanceOf(SubjectChangedError));
    expect(writes).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("drops A's unsaved buffer when the switch unmounts its editor: no write, no toast, nothing registered", async () => {
    const writes = jest.fn(async (_body: string, _as: string | null) => 'saved');
    function TermsEditor() {
      const upsert = useMutation({
        mutationFn: async (body: string) => writes(body, await getSessionUserId()),
      });
      const autosave = useBufferedAutosave<string, { body: string }>({
        proposalId: 'proposal-shared',
        delay: 800,
        save: (_key, next) => upsert.mutateAsync(next.body),
      });
      return <button onClick={() => autosave.queue('terms', { body: 'A terms' })}>type</button>;
    }
    // A page only A has open: B's remount renders without it.
    function OnlyForA() {
      return useSessionUserId() === 'user-a' ? <TermsEditor /> : null;
    }
    renderPortal(<OnlyForA />);
    fireEvent.click(await screen.findByText('type'));
    expect(getProposalAutosaveSnapshot('proposal-shared')).toMatchObject({
      dirty: true,
      registeredBuffers: 1,
    });

    signInAs('user-b');
    await waitFor(() => expect(screen.queryByText('type')).not.toBeInTheDocument());
    await flush();

    expect(writes).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(getProposalAutosaveSnapshot('proposal-shared')).toMatchObject({
      dirty: false,
      flushing: false,
      error: null,
      registeredBuffers: 0,
    });
  });

  it("drops A's failed buffers still registered for a later Send", async () => {
    renderPortal(<Rows />);
    // An editor A closed whose last save failed: kept for the SendSheet to retry.
    const closed = renderHook(() =>
      useBufferedAutosave<string, { body: string }>({
        proposalId: 'proposal-closed',
        delay: 800,
        save: async () => {
          throw new Error('refused');
        },
      }),
    );
    act(() => closed.result.current.queue('terms', { body: 'A terms' }));
    closed.unmount();
    await waitFor(() => expect(getProposalAutosaveSnapshot('proposal-closed').error).toBe('refused'));
    expect(getProposalAutosaveSnapshot('proposal-closed').registeredBuffers).toBe(1);

    signInAs('user-b');

    expect(getProposalAutosaveSnapshot('proposal-closed')).toMatchObject({
      dirty: false,
      error: null,
      registeredBuffers: 0,
    });
  });

  it("hands Realtime B's token before the remount re-subscribes after a cookie-only switch", async () => {
    function NotesChannel() {
      useEffect(() => {
        const supabase = createBrowserClient();
        const channel = supabase.channel('project-notes:p1').subscribe();
        return () => {
          void supabase.removeChannel(channel);
        };
      }, []);
      return null;
    }
    renderApp(newClient(), <NotesChannel />);
    expect(mockSubscribedAs).toEqual(['project-notes:p1 jwt-user-a']);

    // No auth event: supabase-js never hands Realtime a token for this switch.
    mockStoredUser = 'user-b';
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(mockSubscribedAs).toHaveLength(2));
    expect(mockSubscribedAs[1]).toBe('project-notes:p1 jwt-user-b');

    // To no one: the re-subscribe carries no one's token, then the anon key.
    mockStoredUser = null;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(mockSubscribedAs).toHaveLength(3));
    expect(mockSubscribedAs[2]).not.toContain('jwt-');
    await waitFor(() => expect(mockRealtime.accessTokenValue).toBe('anon-key'));
  });

  it("an autosave paused offline at the switch never holds B's Send and leaves nothing registered", async () => {
    const writes = jest.fn(async (_body: string, _as: string | null) => 'saved');
    function TermsEditor() {
      const upsert = useMutation({
        mutationFn: async (body: string) => writes(body, await getSessionUserId()),
      });
      const autosave = useBufferedAutosave<string, { body: string }>({
        proposalId: 'proposal-shared',
        delay: 800,
        save: (_key, next) => upsert.mutateAsync(next.body),
      });
      return (
        <button
          onClick={() => {
            autosave.queue('terms', { body: 'A terms' });
            void autosave.flush('terms');
          }}
        >
          type
        </button>
      );
    }
    function OnlyForA() {
      return useSessionUserId() === 'user-a' ? <TermsEditor /> : null;
    }
    renderPortal(<OnlyForA />);
    act(() => onlineManager.setOnline(false));
    fireEvent.click(await screen.findByText('type'));
    await flush();
    // A's save is in flight, paused by query-core until a reconnect.
    expect(onScreen!.getMutationCache().getAll()[0]?.state.isPaused).toBe(true);
    expect(getProposalAutosaveSnapshot('proposal-shared')).toMatchObject({
      flushing: true,
      registeredBuffers: 1,
    });

    signInAs('user-b');
    await waitFor(() => expect(screen.queryByText('type')).not.toBeInTheDocument());

    const sent = jest.fn();
    void flushProposalAutosaves('proposal-shared').then(sent);
    await flush();
    expect(sent).toHaveBeenCalled();
    expect(getProposalAutosaveSnapshot('proposal-shared')).toMatchObject({
      dirty: false,
      flushing: false,
      error: null,
      registeredBuffers: 0,
    });
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await flush();
    expect(writes).not.toHaveBeenCalled();
  });

  it("a sign-in only the cookie reports (no one to B) remounts and hands Realtime B's token", async () => {
    let mounts = 0;
    function Mounted() {
      const [mount] = useState(() => ++mounts);
      return <p>mount {mount}</p>;
    }
    renderApp(
      newClient(),
      <>
        <Mounted />
        <ProjectNotesChannel />
      </>,
    );
    // Another portal signs A out, then signs B in; no auth event reaches this tab.
    mockStoredUser = null;
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByText('mount 2')).toBeInTheDocument();
    await waitFor(() => expect(mockRealtime.accessTokenValue).toBe('anon-key'));

    mockStoredUser = 'user-b';
    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByText('mount 3')).toBeInTheDocument();
    expect(mockSubscribedAs.at(-1)).toBe('project-notes:p1 jwt-user-b');
    expect(mockRealtime.accessTokenValue).toBe('jwt-user-b');
  });

  it("follows a refresh another portal writes for the same subject on Realtime's next heartbeat", async () => {
    renderApp(newClient(), <ProjectNotesChannel />);
    mockStoredUser = 'user-b';
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(mockSubscribedAs.at(-1)).toBe('project-notes:p1 jwt-user-b'));
    await flush();

    // Another portal refreshes B's session: same subject, a new JWT, no event here.
    mockRefreshes = 1;
    const connected = jest.spyOn(mockRealtime, 'isConnected').mockReturnValue(true);
    const push = jest.spyOn(mockRealtime, 'push').mockImplementation(() => {});
    try {
      await act(async () => mockRealtime.sendHeartbeat());
      await waitFor(() => expect(mockRealtime.accessTokenValue).toBe('jwt-user-b-r1'));
    } finally {
      connected.mockRestore();
      push.mockRestore();
      mockRealtime.pendingHeartbeatRef = null;
    }
  });

  it("dismisses the toasts already showing for A when the subject changes", async () => {
    renderApp(newClient(), <Rows />);
    render(<OpenToasts />);
    await screen.findByText('user-a row');
    act(() => {
      toast({ title: 'The order could not be saved.' });
    });
    expect(screen.getByText('The order could not be saved.')).toBeInTheDocument();

    signInAs('user-b');

    await waitFor(() =>
      expect(screen.queryByText('The order could not be saved.')).not.toBeInTheDocument(),
    );
  });

  it("drops the analytics a continuation of A's work captures after the switch", async () => {
    const saved = deferred<string>();
    const captured = jest.fn();
    function InspectionLog() {
      const log = useMutation({ mutationFn: () => saved.promise });
      return (
        <button
          onClick={async () => {
            const capture = forThisSubject();
            await log.mutateAsync();
            capture(captured, 'procurement_inspection_logged');
          }}
        >
          log
        </button>
      );
    }
    renderPortal(<InspectionLog />);
    fireEvent.click(screen.getByText('log'));
    await flush();

    // A's save is already running when B signs in, and finishes afterwards.
    signInAs('user-b');
    await act(async () => saved.resolve('saved'));
    await flush();
    expect(captured).not.toHaveBeenCalled();

    // B's own work still captures.
    fireEvent.click(screen.getByText('log'));
    await waitFor(() => expect(captured).toHaveBeenCalledTimes(1));
  });

  it("withdraws A's Undo offer, so B's remounted band never shows it", async () => {
    renderApp(newClient(), <ReturnToLeadUndo />);
    act(() =>
      offerReturnToLeadUndo({ message: 'Moved to Discovery', designerClientId: 'designer-client-a' }),
    );
    expect(screen.getByTestId('return-to-lead-undo')).toHaveTextContent('Moved to Discovery');

    signInAs('user-b');
    await flush();

    expect(screen.queryByTestId('return-to-lead-undo')).not.toBeInTheDocument();
  });

  it('runs on one auth subscription and never asks getUser()', () => {
    expect(mockAuthCounts.onAuthStateChange).toBe(1);
    expect(mockAuthCounts.getSession).toBe(1);
    expect(mockAuthCounts.getUser).toBe(0);
  });
});
