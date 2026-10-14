/**
 * US-34 N12a — the feedback grammar (plan §5.1, D2 §2/§6, PQ12/PQ15/PQ16).
 *
 *   the clock     quiet under 400 ms; `saving…` at 400 ms, held ≥500 ms; 8 s line
 *   act classes   optimistic (value first), pending-only (verb first), send
 *   the band      one quiet `saving…`, gone when nothing is pending, never "Saved"
 *   unload        closing the tab asks while a write is pending
 *   offline       sends and money refuse before any call; edits wait and save
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
  useMutation,
  type MutationMeta,
} from '@tanstack/react-query';
import { useOptimisticMutation } from '@patina/supabase';
import { queryClient as portalClient, OFFLINE_NOT_SENT, OfflineRefusal } from '@/lib/react-query';
import { isWordShowing, useActFeedback, type ActLike } from '../use-act-feedback';
import { ActStillLine, NOTHING_SENT_TWICE, STILL_SENDING, STILL_WORKING } from '../act-still-line';
import { OFFLINE_WAITING, SAVING_WORD, SavingBand } from '../saving-band';

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** TanStack notifies observers on a 0 ms timer; flush it with the clock. */
const advance = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

const freshClient = () => new QueryClient({ defaultOptions: { mutations: { retry: false } } });

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  onlineManager.setOnline(true);
  portalClient.clear();
});

describe('useActFeedback — the 400 / 500 ms clock', () => {
  const clock = () =>
    renderHook(({ status }: ActLike) => useActFeedback({ status }), {
      initialProps: { status: 'idle' } as ActLike,
    });
  const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

  it('stays quiet under 400 ms and prints the word at 400 ms', () => {
    const { result, rerender } = clock();
    rerender({ status: 'pending' });
    expect(result.current.phase).toBe('pending-quiet');
    tick(399);
    expect(result.current.phase).toBe('pending-quiet');
    tick(1);
    expect(result.current.phase).toBe('pending-word');
  });

  it('holds the word at least 500 ms through the settle, so it never blinks', () => {
    const { result, rerender } = clock();
    rerender({ status: 'pending' });
    tick(450);
    rerender({ status: 'success' });
    expect(result.current.phase).toBe('pending-word');
    tick(449);
    expect(result.current.phase).toBe('pending-word');
    tick(1);
    expect(result.current.phase).toBe('settled');
  });

  it('a write that answers inside 400 ms never shows the word', () => {
    const { result, rerender } = clock();
    rerender({ status: 'pending' });
    tick(200);
    rerender({ status: 'success' });
    expect(result.current.phase).toBe('settled');
    tick(1000);
    expect(result.current.phase).toBe('settled');
  });

  it('a failure inside the hold waits it out, then reads failed', () => {
    const { result, rerender } = clock();
    rerender({ status: 'pending' });
    tick(400);
    rerender({ status: 'error' });
    expect(result.current.phase).toBe('pending-word');
    tick(500);
    expect(result.current.phase).toBe('failed');
  });

  it('turns slow at 8 s', () => {
    const { result, rerender } = clock();
    rerender({ status: 'pending' });
    tick(7999);
    expect(result.current.phase).toBe('pending-word');
    tick(1);
    expect(result.current.phase).toBe('slow');
  });

  it('the next pending spell starts quiet again', () => {
    const { result, rerender } = clock();
    rerender({ status: 'pending' });
    tick(400);
    rerender({ status: 'success' });
    tick(500);
    rerender({ status: 'pending' });
    expect(result.current.phase).toBe('pending-quiet');
  });

  it('a press answers at once and lapses after the 100 ms budget if nothing starts', () => {
    const { result } = clock();
    act(() => result.current.press());
    expect(result.current.phase).toBe('pressed');
    tick(100);
    expect(result.current.phase).toBe('idle');
  });
});

describe('act class: optimistic (the value answers first)', () => {
  type Task = { id: string; done: boolean };
  const KEY = ['n12a-tasks'] as const;

  function TickRow({ write }: { write: (task: Task) => Promise<Task> }) {
    const tick = useOptimisticMutation<Task, Task | null, Task[]>({
      mutationFn: write,
      apply: (rows, task) => rows.map((row) => (row.id === task.id ? task : row)),
      invert: (rows, task, { previous }) =>
        rows.map((row) => (row.id === task.id ? previous.find((p) => p.id === task.id) ?? row : row)),
      merge: (rows, receipt) => rows.map((row) => (row.id === receipt.id ? receipt : row)),
      keys: [KEY],
      scopeId: 'task:t1',
      honesty: 'internal',
    });
    const { phase } = useActFeedback(tick);
    const row = (cachedRows() ?? [])[0];
    return (
      <div>
        <button type="button" aria-pressed={row?.done} onClick={() => tick.mutate({ id: 't1', done: true })}>
          Tick
        </button>
        <span data-testid="meta">{isWordShowing(phase) ? 'saving…' : row?.done ? 'done' : 'open'}</span>
      </div>
    );
  }
  const client = freshClient();
  const cachedRows = () => client.getQueryData<Task[]>(KEY);

  it('shows the new value at once, prints saving… only past 400 ms, and returns to truth', async () => {
    client.setQueryData(KEY, [{ id: 't1', done: false }]);
    const receipt = deferred<Task>();
    render(
      <QueryClientProvider client={client}>
        <TickRow write={() => receipt.promise} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tick' }));
    await advance(0);
    expect(screen.getByTestId('meta')).toHaveTextContent('done');
    await advance(399);
    expect(screen.getByTestId('meta')).toHaveTextContent('done');
    await advance(1);
    expect(screen.getByTestId('meta')).toHaveTextContent('saving…');
    await act(async () => receipt.resolve({ id: 't1', done: true }));
    await advance(0);
    expect(screen.getByTestId('meta')).toHaveTextContent('saving…');
    await advance(500);
    expect(screen.getByTestId('meta')).toHaveTextContent('done');
  });
});

describe('act class: pending-only (the verb answers first)', () => {
  function Advance({ write }: { write: () => Promise<unknown> }) {
    const advanceMutation = useMutation({ mutationFn: write });
    const { phase } = useActFeedback(advanceMutation);
    return (
      <div>
        <button type="button" aria-busy={advanceMutation.isPending} onClick={() => advanceMutation.mutate()}>
          {advanceMutation.isPending ? 'Completing…' : 'Complete the phase'}
        </button>
        <ActStillLine phase={phase} act="write" />
      </div>
    );
  }

  it('changes the verb at the press and adds "Still working." at 8 s, never a send line', async () => {
    render(
      <QueryClientProvider client={freshClient()}>
        <Advance write={() => deferred().promise} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Complete the phase' }));
    await advance(0);
    expect(screen.getByRole('button', { name: 'Completing…' })).toHaveAttribute('aria-busy', 'true');
    await advance(7999);
    expect(screen.queryByText(STILL_WORKING)).not.toBeInTheDocument();
    await advance(1);
    expect(screen.getByText(STILL_WORKING)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(STILL_SENDING))).not.toBeInTheDocument();
  });
});

describe('act class: send', () => {
  function Send({
    write,
    idempotent = false,
  }: {
    write: () => Promise<unknown>;
    idempotent?: boolean;
  }) {
    const send = useMutation({ mutationFn: write, retry: false, meta: { act: 'send', errorSurface: 'inline' } });
    const { phase } = useActFeedback(send);
    return (
      <div>
        <button type="button" onClick={() => send.mutate()}>
          {send.isPending ? 'Sending…' : 'Send'}
        </button>
        {send.error && <p role="alert">{(send.error as Error).message}</p>}
        <ActStillLine phase={phase} act="send" idempotent={idempotent} />
      </div>
    );
  }
  const mount = (ui: React.ReactElement) =>
    render(<QueryClientProvider client={portalClient}>{ui}</QueryClientProvider>);
  // The refusal is logged by the MutationCache; keep the run readable.
  let quiet: jest.SpyInstance;
  beforeEach(() => {
    quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => quiet.mockRestore());

  it('says "Still sending." at 8 s and never claims "Nothing is sent twice." unless proven', async () => {
    mount(<Send write={() => deferred().promise} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await advance(8000);
    expect(screen.getByText(STILL_SENDING)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(NOTHING_SENT_TWICE))).not.toBeInTheDocument();
  });

  it('adds "Nothing is sent twice." only for a send marked idempotent (outbound drafts, O4)', async () => {
    mount(<Send write={() => deferred().promise} idempotent />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await advance(8000);
    expect(screen.getByText(`${STILL_SENDING} ${NOTHING_SENT_TWICE}`)).toBeInTheDocument();
  });

  it('offline, refuses before any call and never fires on reconnect', async () => {
    const write = jest.fn(async () => 'sent');
    onlineManager.setOnline(false);
    mount(<Send write={write} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await advance(0);
    expect(screen.getByRole('alert')).toHaveTextContent(OFFLINE_NOT_SENT);
    expect(write).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    await advance(1000);
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('a money write is refused the same way, as an OfflineRefusal', async () => {
    const write = jest.fn(async () => 'recorded');
    onlineManager.setOnline(false);
    const mutation = portalClient.getMutationCache().build(portalClient, {
      meta: { act: 'money', errorSurface: 'inline' } satisfies MutationMeta,
      mutationFn: write,
      retry: false,
    });
    await expect(mutation.execute(undefined)).rejects.toBeInstanceOf(OfflineRefusal);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('SavingBand — the one quiet band', () => {
  function Write({ write, meta }: { write: () => Promise<unknown>; meta?: MutationMeta }) {
    const m = useMutation({ mutationFn: write, meta });
    return (
      <button type="button" onClick={() => m.mutate()}>
        write
      </button>
    );
  }
  const band = () => document.querySelector('[data-saving-band]') as HTMLElement;
  const leaving = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const mount = (client: QueryClient, ui: React.ReactElement) =>
    render(
      <QueryClientProvider client={client}>
        <SavingBand />
        {ui}
      </QueryClientProvider>,
    );

  it('is a silent status region that prints saving… past 400 ms, holds it, then simply disappears', async () => {
    const receipt = deferred();
    mount(freshClient(), <Write write={() => receipt.promise} />);
    expect(band()).toHaveAttribute('role', 'status');
    expect(band()).toHaveAttribute('aria-live', 'off');
    fireEvent.click(screen.getByRole('button', { name: 'write' }));
    await advance(399);
    expect(band()).toBeEmptyDOMElement();
    await advance(1);
    expect(band()).toHaveTextContent(SAVING_WORD);
    await act(async () => receipt.resolve('ok'));
    await advance(0);
    expect(band()).toHaveTextContent(SAVING_WORD);
    await advance(500);
    expect(band()).toBeEmptyDOMElement();
    expect(document.body).not.toHaveTextContent(/saved/i);
  });

  it('asks before the tab closes only while a write is pending', async () => {
    const receipt = deferred();
    mount(freshClient(), <Write write={() => receipt.promise} />);
    expect(leaving()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'write' }));
    await advance(0);
    expect(leaving()).toBe(true);
    await act(async () => receipt.resolve('ok'));
    await advance(0);
    expect(leaving()).toBe(false);
  });

  it('leaves a silent background write out of the word and the guard', async () => {
    mount(freshClient(), <Write write={() => deferred().promise} meta={{ errorSurface: 'silent' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'write' }));
    await advance(1000);
    expect(band()).toBeEmptyDOMElement();
    expect(leaving()).toBe(false);
  });

  it('offline, an edit waits (saying so) and saves on reconnect', async () => {
    const write = jest.fn(async () => 'ok');
    onlineManager.setOnline(false);
    mount(freshClient(), <Write write={write} />);
    fireEvent.click(screen.getByRole('button', { name: 'write' }));
    await advance(0);
    expect(write).not.toHaveBeenCalled();
    expect(band()).toHaveTextContent(OFFLINE_WAITING);
    expect(leaving()).toBe(true);
    act(() => onlineManager.setOnline(true));
    await advance(0);
    expect(write).toHaveBeenCalledTimes(1);
    await advance(500);
    expect(band()).toBeEmptyDOMElement();
  });
});
