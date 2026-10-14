import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;

const h = vi.hoisted(() => {
  const state = {
    emit: null as null | ((event: string, session: { user: { id: string } } | null) => void),
    subscribe: null as null | ((reader: () => void) => () => void),
    getSnapshot: null as null | (() => string | null),
  };
  const auth = {
    getSession: vi.fn(),
    getUser: vi.fn(),
    onAuthStateChange: vi.fn(),
    // The shared auth cookie, as the client's storage adapter reads it.
    storageKey: 'sb-test-auth-token',
    storage: { getItem: vi.fn() },
  };
  return { state, auth };
});

vi.mock('../../client', () => ({ createBrowserClient: () => ({ auth: h.auth }) }));

// No renderer here: capture what the hook hands useSyncExternalStore.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useSyncExternalStore: (
    subscribe: (reader: () => void) => () => void,
    getSnapshot: () => string | null,
  ) => {
    h.state.subscribe = subscribe;
    h.state.getSnapshot = getSnapshot;
    return getSnapshot();
  },
}));

const session = (id: string | null) => (id ? { user: { id } } : null);
const emit = (event: string, id: string | null) => h.state.emit!(event, session(id));

/** What another portal leaves in the shared cookie: a full stored session. */
const cookie = (id: string | null) =>
  id
    ? JSON.stringify({
        access_token: `jwt-${id}`,
        refresh_token: `refresh-${id}`,
        expires_at: 4102444800,
        user: { id },
      })
    : null;
const storeCookie = (id: string | null) => h.auth.storage.getItem.mockResolvedValue(cookie(id));

async function loadStore() {
  vi.resetModules();
  return import('../session-user');
}

let doc: EventTarget & { visibilityState: string };

beforeEach(() => {
  h.state.emit = null;
  h.auth.getSession.mockReset().mockResolvedValue({ data: { session: session('user-a') } });
  h.auth.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'server-user' } } });
  h.auth.onAuthStateChange.mockReset().mockImplementation((cb: AuthCallback) => {
    h.state.emit = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  h.auth.storage.getItem.mockReset();
  storeCookie('user-a');
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', doc);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('session-user store (browser)', () => {
  it('seeds from getSession() and never calls getUser()', async () => {
    const store = await loadStore();

    await expect(store.getSessionUserId()).resolves.toBe('user-a');
    await expect(store.getSessionUserId()).resolves.toBe('user-a');

    expect(h.auth.getSession).toHaveBeenCalledTimes(1);
    expect(h.auth.getUser).not.toHaveBeenCalled();
  });

  it('opens exactly one onAuthStateChange subscription for reads, hooks and subject listeners', async () => {
    const store = await loadStore();

    await store.getSessionUserId();
    store.useSessionUserId();
    const unsubscribeReader = h.state.subscribe!(() => {});
    store.useSessionUserId();
    h.state.subscribe!(() => {});
    store.onSessionSubjectChange(() => {});
    store.onSessionSubjectChange(() => {});
    await store.getSessionUserId();
    unsubscribeReader();

    expect(h.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(h.auth.getSession).toHaveBeenCalledTimes(1);
  });

  it('reports user A to user B with no SIGNED_OUT between, before readers re-render', async () => {
    const store = await loadStore();
    const calls: string[] = [];
    store.onSessionSubjectChange((prev, next) => calls.push(`subject ${prev}->${next}`));
    store.useSessionUserId();
    h.state.subscribe!(() => calls.push(`reader ${h.state.getSnapshot!()}`));
    await store.getSessionUserId();
    calls.length = 0;

    emit('TOKEN_REFRESHED', 'user-a');
    expect(calls).toEqual([]);

    emit('SIGNED_IN', 'user-b');
    expect(calls).toEqual(['subject user-a->user-b', 'reader user-b']);
    await expect(store.getSessionUserId()).resolves.toBe('user-b');
  });

  it('reports none to someone and someone to none', async () => {
    h.auth.getSession.mockResolvedValue({ data: { session: null } });
    const store = await loadStore();
    const changes: Array<[string | null, string | null]> = [];
    store.onSessionSubjectChange((prev, next) => changes.push([prev, next]));
    await expect(store.getSessionUserId()).resolves.toBeNull();

    emit('SIGNED_IN', 'user-a');
    emit('SIGNED_OUT', null);

    expect(changes).toEqual([
      [null, 'user-a'],
      ['user-a', null],
    ]);
  });

  it('treats the first reading as the starting subject, whichever arrives first', async () => {
    let resolveSession!: (value: unknown) => void;
    h.auth.getSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));
    const store = await loadStore();
    const changes: Array<[string | null, string | null]> = [];
    store.onSessionSubjectChange((prev, next) => changes.push([prev, next]));

    emit('INITIAL_SESSION', 'user-a');
    resolveSession({ data: { session: session('user-a') } });

    await expect(store.getSessionUserId()).resolves.toBe('user-a');
    expect(changes).toEqual([]);
  });

  it('reads as signed out when getSession() fails', async () => {
    h.auth.getSession.mockRejectedValue(new Error('storage unavailable'));
    const store = await loadStore();

    await expect(store.getSessionUserId()).resolves.toBeNull();
    expect(h.auth.getUser).not.toHaveBeenCalled();
  });

  it('follows a cookie another portal swapped or cleared when the tab is shown or focused', async () => {
    const store = await loadStore();
    const changes: Array<[string | null, string | null]> = [];
    store.onSessionSubjectChange((prev, next) => changes.push([prev, next]));
    await expect(store.getSessionUserId()).resolves.toBe('user-a');
    storeCookie('user-b');

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.auth.storage.getItem).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(changes).toEqual([['user-a', 'user-b']]));
    await expect(store.getSessionUserId()).resolves.toBe('user-b');

    storeCookie(null);
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(changes).toEqual([['user-a', 'user-b'], ['user-b', null]]));
    await expect(store.getSessionUserId()).resolves.toBeNull();

    // Storage only: no auth call, so no lock and no network.
    expect(h.auth.storage.getItem).toHaveBeenCalledWith('sb-test-auth-token');
    expect(h.auth.getSession).toHaveBeenCalledTimes(1);
    expect(h.auth.getUser).not.toHaveBeenCalled();
  });

  it('re-reads the cookie on a read at most once per 2 s', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const store = await loadStore();
    const changes: Array<[string | null, string | null]> = [];
    store.onSessionSubjectChange((prev, next) => changes.push([prev, next]));
    await expect(store.getSessionUserId()).resolves.toBe('user-a');
    storeCookie('user-b');

    now.mockReturnValue(1_001_999);
    await expect(store.getSessionUserId()).resolves.toBe('user-a');
    expect(h.auth.storage.getItem).not.toHaveBeenCalled();

    now.mockReturnValue(1_002_000);
    await expect(store.getSessionUserId()).resolves.toBe('user-b');
    expect(changes).toEqual([['user-a', 'user-b']]);
    await store.getSessionUserId();
    // The re-read and the read that confirmed it.
    expect(h.auth.storage.getItem).toHaveBeenCalledTimes(2);
    expect(h.auth.getSession).toHaveBeenCalledTimes(1);
    expect(h.auth.getUser).not.toHaveBeenCalled();
  });

  it('lets an auth event that lands during a re-read win over what it read', async () => {
    const store = await loadStore();
    await store.getSessionUserId();
    let finishRead!: (value: string | null) => void;
    h.auth.storage.getItem.mockReturnValue(new Promise((resolve) => (finishRead = resolve)));

    window.dispatchEvent(new Event('focus'));
    emit('SIGNED_IN', 'user-c');
    finishRead(cookie('user-b'));

    await expect(store.getSessionUserId()).resolves.toBe('user-c');
  });

  it('follows a re-read that names another subject only once a second read 300 ms later agrees', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const store = await loadStore();
    const changes: Array<[string | null, string | null, string | null]> = [];
    store.onSessionSubjectChange((prev, next, token) => changes.push([prev, next, token]));
    await expect(store.getSessionUserId()).resolves.toBe('user-a');

    // Another portal refreshing A's chunked cookie: an empty jar for a moment, then A.
    h.auth.storage.getItem.mockResolvedValueOnce(null).mockResolvedValueOnce(cookie('user-a'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(300);
    await expect(store.getSessionUserId()).resolves.toBe('user-a');
    expect(h.auth.storage.getItem).toHaveBeenCalledTimes(2);
    expect(changes).toEqual([]);

    storeCookie('user-b');
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(299);
    expect(changes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(store.getSessionUserId()).resolves.toBe('user-b');
    expect(changes).toEqual([['user-a', 'user-b', 'jwt-user-b']]);

    // An auth event during the confirming wait still wins.
    storeCookie(null);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    emit('SIGNED_IN', 'user-c');
    await vi.advanceTimersByTimeAsync(300);
    await expect(store.getSessionUserId()).resolves.toBe('user-c');
    expect(changes.map(([prev, next]) => [prev, next])).toEqual([
      ['user-a', 'user-b'],
      ['user-b', 'user-c'],
    ]);
  });
});

describe('session-user store (no browser)', () => {
  it('keeps getUser() semantics and never subscribes or stores a subject', async () => {
    vi.unstubAllGlobals();
    const store = await loadStore();
    const listener = vi.fn();

    await expect(store.getSessionUserId()).resolves.toBe('server-user');
    store.onSessionSubjectChange(listener)();

    expect(h.auth.getUser).toHaveBeenCalledTimes(1);
    expect(h.auth.onAuthStateChange).not.toHaveBeenCalled();
    expect(h.auth.getSession).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});
