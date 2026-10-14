import { describe, expect, it, vi } from 'vitest';
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
  useMutation,
  useMutationState,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import {
  optimisticMutationKey,
  optimisticMutationOptions,
  useOptimisticMutation,
  ZeroRowReceiptError,
  type OptimisticReceipt,
  type UseOptimisticMutationOptions,
} from '../optimistic';

// Real QueryClient, MutationCache and scope scheduling throughout. Only the
// three React bindings are stubbed, for the hook-wiring test at the end.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQueryClient: vi.fn(), useMutation: vi.fn(), useMutationState: vi.fn() };
});

type Task = { id: string; status: 'todo' | 'done'; completed_at?: string };
type Tick = { id: string; status: Task['status'] };

const TASKS: QueryKey = ['section-tasks', 'p1'];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every queued microtask (onMutate, scope hand-off, merges) run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const withStatus = (list: Task[], id: string, status: Task['status']) =>
  list.map((t) => (t.id === id ? { ...t, status } : t));
const rowIn = (list: Task[] | undefined, id: string) => list?.find((t) => t.id === id);

/** The tick shape N3 adopts: a field-level patch and inverse, the receipt row merged by id. */
function tickOptions<TReceipt extends OptimisticReceipt = Task | null>(
  scopeId: string,
  write: (v: Tick) => Promise<TReceipt>,
): UseOptimisticMutationOptions<Tick, TReceipt, Task[]> {
  return {
    mutationFn: write,
    keys: [TASKS],
    scopeId,
    honesty: 'internal',
    apply: (list, v) => withStatus(list, v.id, v.status),
    invert: (list, v, { previous }) => withStatus(list, v.id, rowIn(previous, v.id)!.status),
  };
}

function mergeRow(list: Task[], row: Task) {
  return list.map((t) => (t.id === row.id ? row : t));
}

function observe<TVariables, TReceipt extends OptimisticReceipt, TCache>(
  client: QueryClient,
  options: UseOptimisticMutationOptions<TVariables, TReceipt, TCache>,
) {
  return new MutationObserver(client, optimisticMutationOptions(client, options));
}

function pendingIds(client: QueryClient, scopeId: string) {
  return client
    .getMutationCache()
    .findAll({ mutationKey: optimisticMutationKey(scopeId), status: 'pending' })
    .map((m) => (m.state.variables as Tick).id);
}

describe('useOptimisticMutation (US-34 N2)', () => {
  it('R5: two rows of one list settle in reverse order; the first fails, the second survives', async () => {
    const client = new QueryClient();
    client.setQueryData<Task[]>(TASKS, [
      { id: 'a', status: 'todo' },
      { id: 'b', status: 'todo' },
    ]);
    const writeA = deferred<Task | null>();
    const writeB = deferred<Task | null>();
    const a = observe(client, { ...tickOptions('task:a', () => writeA.promise), merge: mergeRow });
    const b = observe(client, { ...tickOptions('task:b', () => writeB.promise), merge: mergeRow });

    const settledA = a.mutate({ id: 'a', status: 'done' }).catch((e: unknown) => e);
    const settledB = b.mutate({ id: 'b', status: 'done' });
    await flush();
    expect(client.getQueryData(TASKS)).toEqual([
      { id: 'a', status: 'done' },
      { id: 'b', status: 'done' },
    ]);

    // B started second and lands first; then A fails.
    writeB.resolve({ id: 'b', status: 'done', completed_at: '2026-10-14T12:00:00Z' });
    await settledB;
    writeA.reject(new Error('500'));
    expect(((await settledA) as Error).message).toBe('500');

    // A whole-list snapshot taken by A would have put b back to 'todo'.
    expect(client.getQueryData(TASKS)).toEqual([
      { id: 'a', status: 'todo' },
      { id: 'b', status: 'done', completed_at: '2026-10-14T12:00:00Z' },
    ]);
  });

  it('serializes repeated actions on one row through the scope fixed at construction', async () => {
    const client = new QueryClient();
    client.setQueryData<Task[]>(TASKS, [{ id: 'a', status: 'todo' }]);
    const writes = [deferred<Task | null>(), deferred<Task | null>()];
    const sent: Tick[] = [];
    const row = observe(client, {
      ...tickOptions('task:a', (v) => {
        sent.push(v);
        return writes[sent.length - 1].promise;
      }),
      merge: mergeRow,
    });

    const first = row.mutate({ id: 'a', status: 'done' });
    const second = row.mutate({ id: 'a', status: 'todo' });
    await flush();

    // Both patches show at once in click order, but only the first write has left.
    expect(rowIn(client.getQueryData<Task[]>(TASKS), 'a')?.status).toBe('todo');
    expect(sent).toEqual([{ id: 'a', status: 'done' }]);
    expect(client.getMutationCache().getAll().map((m) => m.options.scope?.id)).toEqual([
      'task:a',
      'task:a',
    ]);

    writes[0].resolve({ id: 'a', status: 'done' });
    await first;
    // N3 (story log #5): the first receipt merges, then the still-pending
    // second patch goes back on, so the row never flips back to 'done'.
    expect(rowIn(client.getQueryData<Task[]>(TASKS), 'a')?.status).toBe('todo');
    await flush();
    expect(sent).toEqual([
      { id: 'a', status: 'done' },
      { id: 'a', status: 'todo' },
    ]);

    writes[1].resolve({ id: 'a', status: 'todo' });
    await second;
    expect(client.getQueryData(TASKS)).toEqual([{ id: 'a', status: 'todo' }]);
  });

  it('R5: restore across 2 keys inverts only the failed write and keeps concurrent changes', async () => {
    type Row = { id: string; status: string };
    type Resolve = { itemId: string; taskId: string };
    const ITEMS: QueryKey = ['coordination-items', 'p1'];
    const setRow = (list: Row[], id: string, status: string) =>
      list.map((r) => (r.id === id ? { ...r, status } : r));
    // The use-coordination cascade: answering an item unblocks its task.
    const target = (key: QueryKey, v: Resolve) =>
      key[0] === 'coordination-items'
        ? { id: v.itemId, status: 'responded' }
        : { id: v.taskId, status: 'todo' };

    const client = new QueryClient();
    client.setQueryData<Row[]>(ITEMS, [
      { id: 'q1', status: 'open' },
      { id: 'q2', status: 'open' },
    ]);
    client.setQueryData<Row[]>(TASKS, [
      { id: 't1', status: 'blocked' },
      { id: 't2', status: 'blocked' },
    ]);
    const write = deferred<Row | null>();
    const resolve = observe(client, {
      mutationFn: () => write.promise,
      keys: [ITEMS, TASKS],
      scopeId: 'coordination:q1',
      honesty: 'internal',
      apply: (list: Row[], v: Resolve, key) => {
        const t = target(key, v);
        return setRow(list, t.id, t.status);
      },
      invert: (list: Row[], v: Resolve, { key, previous }) => {
        const { id } = target(key, v);
        return setRow(list, id, previous.find((r) => r.id === id)!.status);
      },
    });

    const failed = resolve.mutate({ itemId: 'q1', taskId: 't1' }).catch((e: unknown) => e);
    await flush();
    expect(client.getQueryData(ITEMS)).toEqual([
      { id: 'q1', status: 'responded' },
      { id: 'q2', status: 'open' },
    ]);
    expect(client.getQueryData(TASKS)).toEqual([
      { id: 't1', status: 'todo' },
      { id: 't2', status: 'blocked' },
    ]);

    // Other writes land on both keys while this one is in flight.
    client.setQueryData<Row[]>(ITEMS, (list) => setRow(list!, 'q2', 'responded'));
    client.setQueryData<Row[]>(TASKS, (list) => setRow(list!, 't2', 'done'));

    write.reject(new Error('500'));
    expect(((await failed) as Error).message).toBe('500');
    expect(client.getQueryData(ITEMS)).toEqual([
      { id: 'q1', status: 'open' },
      { id: 'q2', status: 'responded' },
    ]);
    expect(client.getQueryData(TASKS)).toEqual([
      { id: 't1', status: 'blocked' },
      { id: 't2', status: 'done' },
    ]);
  });

  it.each([
    ['an empty row list', [] as Task[]],
    ['an exact count of 0', 0],
    ['no row', null],
  ])('R6: a zero-row receipt (%s) is a failure and rolls back', async (_label, receipt) => {
    const client = new QueryClient();
    client.setQueryData<Task[]>(TASKS, [{ id: 'a', status: 'todo' }]);
    let statusAtWrite: string | undefined;
    const row = observe(
      client,
      tickOptions<Task[] | number | null>('task:a', async (v) => {
        statusAtWrite = rowIn(client.getQueryData<Task[]>(TASKS), v.id)?.status;
        return receipt;
      }),
    );

    await expect(row.mutate({ id: 'a', status: 'done' })).rejects.toBeInstanceOf(
      ZeroRowReceiptError,
    );
    expect(statusAtWrite).toBe('done');
    expect(client.getQueryData(TASKS)).toEqual([{ id: 'a', status: 'todo' }]);
  });

  it('M1b: pending stays true until the receipt is merged into the cache', async () => {
    const client = new QueryClient();
    client.setQueryData<Task[]>(TASKS, [{ id: 'a', status: 'todo' }]);
    const write = deferred<Task | null>();
    const pendingAtMerge: string[][] = [];
    const row = observe(client, {
      ...tickOptions('task:a', () => write.promise),
      merge: (list, receipt) => {
        pendingAtMerge.push(pendingIds(client, 'task:a'));
        return mergeRow(list, receipt);
      },
    });

    const settled = row.mutate({ id: 'a', status: 'done' });
    await flush();
    expect(pendingIds(client, 'task:a')).toEqual(['a']);

    write.resolve({ id: 'a', status: 'done', completed_at: '2026-10-14T12:00:00Z' });
    await settled;
    expect(pendingAtMerge).toEqual([['a']]);
    expect(pendingIds(client, 'task:a')).toEqual([]);
    expect(client.getQueryData(TASKS)).toEqual([
      { id: 'a', status: 'done', completed_at: '2026-10-14T12:00:00Z' },
    ]);
  });

  it('M1b: without a merge, pending stays true until the reconciling refetch lands', async () => {
    const client = new QueryClient();
    const refetch = deferred<Task[]>();
    let reads = 0;
    const list = new QueryObserver<Task[]>(client, {
      queryKey: TASKS,
      queryFn: () => (reads++ === 0 ? Promise.resolve([{ id: 'a', status: 'todo' }]) : refetch.promise),
      staleTime: Infinity,
    });
    const unsubscribe = list.subscribe(() => {});
    await vi.waitFor(() => expect(client.getQueryData(TASKS)).toEqual([{ id: 'a', status: 'todo' }]));

    const write = deferred<number>();
    const row = observe(client, tickOptions<number>('task:a', () => write.promise));
    const settled = row.mutate({ id: 'a', status: 'done' });
    await flush();

    write.resolve(1); // the bare write: exactly one row changed
    await flush();
    expect(reads).toBe(2);
    expect(pendingIds(client, 'task:a')).toEqual(['a']);

    refetch.resolve([{ id: 'a', status: 'done', completed_at: '2026-10-14T12:00:00Z' }]);
    await settled;
    expect(pendingIds(client, 'task:a')).toEqual([]);
    expect(client.getQueryData(TASKS)).toEqual([
      { id: 'a', status: 'done', completed_at: '2026-10-14T12:00:00Z' },
    ]);
    unsubscribe();
  });

  it('fixes scope and mutation key from scopeId at construction, and takes only honesty internal', () => {
    const client = new QueryClient();
    const options = optimisticMutationOptions(client, tickOptions('task:a', async () => null));
    expect(options.scope).toEqual({ id: 'task:a' });
    expect(options.mutationKey).toEqual(['optimistic', 'task:a']);

    const external = { ...tickOptions('task:a', async () => null), honesty: 'external' as 'internal' };
    expect(() => optimisticMutationOptions(client, external)).toThrow(/honesty: 'internal'/);
  });

  it('the hook exposes one pending entry per mutation of its scope', async () => {
    const client = new QueryClient();
    client.setQueryData<Task[]>(TASKS, [
      { id: 'a', status: 'todo' },
      { id: 'b', status: 'todo' },
    ]);
    const options = tickOptions('tasks:p1', () => new Promise<Task | null>(() => {}));
    vi.mocked(useQueryClient).mockReturnValue(client);
    vi.mocked(useMutation).mockImplementation(((o: unknown) => ({ options: o })) as never);
    vi.mocked(useMutationState).mockImplementation((({ filters, select }: never) =>
      client.getMutationCache().findAll(filters).map(select)) as never);

    // Two concurrent writes of one list-scoped mutation: a single observer
    // would only remember the latest variables.
    const writer = observe(client, options);
    void writer.mutate({ id: 'a', status: 'done' });
    void writer.mutate({ id: 'b', status: 'done' });
    await flush();

    const result = useOptimisticMutation(options);
    expect(result.pending).toEqual([
      { id: 'a', status: 'done' },
      { id: 'b', status: 'done' },
    ]);
    const built = vi.mocked(useMutation).mock.calls[0][0];
    expect(built.scope).toEqual({ id: 'tasks:p1' });
    expect(built.mutationKey).toEqual(optimisticMutationKey('tasks:p1'));
  });
});

describe('useOptimisticMutation settles onto the last confirmed value (SQ-1004)', () => {
  /** Tick (A) then untick (B) the same row in one scope; both patch before either settles. */
  function tickThenUntick() {
    const client = new QueryClient();
    client.setQueryData<Task[]>(TASKS, [{ id: 'a', status: 'todo' }]);
    const writes = [deferred<Task | null>(), deferred<Task | null>()];
    let sent = 0;
    const row = observe(client, {
      ...tickOptions('task:a', () => writes[sent++].promise),
      merge: mergeRow,
    });
    const tick = row.mutate({ id: 'a', status: 'done' }).catch((e: unknown) => e);
    const untick = row.mutate({ id: 'a', status: 'todo' }).catch((e: unknown) => e);
    const status = () => rowIn(client.getQueryData<Task[]>(TASKS), 'a')?.status;
    return { client, writes, tick, untick, status, sent: () => sent };
  }

  it('tick then untick, both fail: the row ends at todo, as the server holds', async () => {
    const { client, writes, tick, untick, status, sent } = tickThenUntick();
    await flush();
    expect(status()).toBe('todo');

    writes[0].reject(new Error('500'));
    expect(((await tick) as Error).message).toBe('500');
    // The untick is still pending, so its patch stays on.
    expect(status()).toBe('todo');
    await flush();
    expect(sent()).toBe(2);

    // Its own snapshot holds the tick's unconfirmed 'done'; the rollback must not.
    writes[1].reject(new Error('500'));
    expect(((await untick) as Error).message).toBe('500');
    expect(client.getQueryData(TASKS)).toEqual([{ id: 'a', status: 'todo' }]);
  });

  it('tick fails, untick succeeds: the row ends at the untick receipt', async () => {
    const { client, writes, tick, untick, status } = tickThenUntick();
    await flush();

    writes[0].reject(new Error('500'));
    await tick;
    expect(status()).toBe('todo');
    await flush();

    writes[1].resolve({ id: 'a', status: 'todo', completed_at: undefined });
    await untick;
    expect(client.getQueryData(TASKS)).toEqual([{ id: 'a', status: 'todo', completed_at: undefined }]);
  });

  it('tick succeeds, untick fails: the row ends at the tick receipt', async () => {
    const { client, writes, tick, untick, status } = tickThenUntick();
    await flush();

    writes[0].resolve({ id: 'a', status: 'done', completed_at: '2026-10-14T12:00:00Z' });
    await tick;
    expect(status()).toBe('todo');
    await flush();

    writes[1].reject(new Error('500'));
    expect(((await untick) as Error).message).toBe('500');
    expect(client.getQueryData(TASKS)).toEqual([
      { id: 'a', status: 'done', completed_at: '2026-10-14T12:00:00Z' },
    ]);
  });
});
