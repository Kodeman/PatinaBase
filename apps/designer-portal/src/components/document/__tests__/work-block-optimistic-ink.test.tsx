/**
 * US-34 N3 — optimistic ink on the task tick and the add-task ghost, end to
 * end through the real hooks (use-section-work + useOptimisticMutation) and a
 * real QueryClient. Only the Supabase client and the flag are stubbed.
 *
 * - Flag on: the row turns over on the click, before the server answers.
 * - A forced 500, and a receipt of zero rows (an RLS-hidden or removed row),
 *   both put the row back and leave one role="alert" line.
 * - Flag off: today's pending-only tick (F16), no ✓ before the receipt.
 */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WorkBlock } from '../work-block';

let mockInk = true;
const mockUpdate = jest.fn();
const mockInsert = jest.fn();

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'optimistic-ink' ? mockInk : false, isLoading: false }),
}));

jest.mock('@patina/supabase', () => {
  const actual = jest.requireActual('@patina/supabase');
  return {
    ...actual,
    useCaptureMediaUrls: () => ({ data: {} }),
    getSessionUserId: async () => 'user-1',
    createBrowserClient: () => ({
      from: () => ({
        update: (patch: unknown) => ({
          eq: (_column: string, id: string) => {
            const answer = mockUpdate(id, patch);
            // The plain path awaits `.eq()`; the ink path asks for its row.
            return Object.assign(Promise.resolve(answer).then(() => ({ error: null })), {
              select: () => ({ maybeSingle: () => answer }),
            });
          },
        }),
        insert: (row: unknown) => ({
          select: () => ({ maybeSingle: () => mockInsert(row) }),
        }),
      }),
    }),
  };
});

jest.mock('@/hooks/use-field-capture-photos', () => ({
  useFieldCapturePhotoPaths: () => ({ data: {} }),
}));
jest.mock('../date', () => ({ FolioPopover: () => null, FolioCalendar: () => null }));
jest.mock('../schedule-thread-panel', () => ({ ScheduleThreadPanel: () => null }));

const KEY = ['section-tasks', 'project-1'];

const task = (id: string, status: 'todo' | 'done') => ({
  id,
  project_id: 'project-1',
  section_key: 'install',
  title: `Hang ${id}`,
  status,
  due_date: null,
  starts_on: null,
  completed_at: status === 'done' ? '2026-10-14T12:00:00.000Z' : null,
  estimate_minutes: null,
  sort_order: 0,
  owner: 'designer',
  owner_party_id: null,
  blocked_by_item_id: null,
  seq_after_task_id: null,
  field_capture_id: null,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** The Document reads the tasks at the region root; here, from the cache. */
function Harness() {
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => [], staleTime: Infinity });
  return (
    <WorkBlock
      projectId="project-1"
      sectionKey="install"
      sectionLabel="Install"
      clientUserId={null}
      clientName="Avery"
      tasks={data as never}
      gates={[]}
      loggedMinutes={0}
      workLoading={false}
      workError={false}
      onRetryWork={() => {}}
    />
  );
}

function mount(rows: ReturnType<typeof task>[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(KEY, rows);
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<Harness />, { wrapper: wrap });
  return client;
}

const row = (name: RegExp) => screen.getByRole('button', { name });

beforeAll(() => {
  // jsdom has no crypto.randomUUID; browsers do (secure contexts).
  if (typeof globalThis.crypto.randomUUID !== 'function') {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: jest.requireActual('crypto').randomUUID,
      configurable: true,
    });
  }
});

beforeEach(() => {
  mockInk = true;
  mockUpdate.mockReset();
  mockInsert.mockReset();
});

describe('WorkBlock tick with optimistic-ink (N3)', () => {
  it('turns the row over on the click, before the server answers, then settles on the receipt', async () => {
    const write = deferred<{ data: unknown; error: unknown }>();
    mockUpdate.mockReturnValue(write.promise);
    mount([task('a', 'todo')]);

    await act(async () => {
      fireEvent.click(row(/Hang a/));
    });
    expect(mockUpdate).toHaveBeenCalledWith('a', expect.objectContaining({ status: 'done' }));
    // The write is still unanswered (deferred): the ✓ is the patch, not the receipt.
    await waitFor(() => expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'true'));
    expect(row(/Hang a/)).toHaveAttribute('aria-busy', 'true');
    // Unconfirmed: `saving…` arrives only after 400 ms.
    expect(screen.queryByText('saving…')).toBeNull();
    await screen.findByText('saving…', undefined, { timeout: 1500 });

    await act(async () => {
      write.resolve({ data: task('a', 'done'), error: null });
    });
    await waitFor(() => expect(row(/Hang a/)).not.toHaveAttribute('aria-busy'));
    expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a forced 500 puts the row back with one role="alert" line and Try again', async () => {
    const write = deferred<{ data: unknown; error: unknown }>();
    mockUpdate.mockReturnValue(write.promise);
    mount([task('a', 'todo')]);

    await act(async () => {
      fireEvent.click(row(/Hang a/));
    });
    await waitFor(() => expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'true'));

    await act(async () => {
      write.resolve({ data: null, error: { message: 'Internal Server Error', code: '500' } });
    });
    await waitFor(() => expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t save\. .Hang a. is as it was\./);

    mockUpdate.mockResolvedValue({ data: task('a', 'done'), error: null });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mockUpdate).toHaveBeenLastCalledWith('a', expect.objectContaining({ status: 'done' }));
    expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('a receipt of zero rows (RLS-hidden or removed) also puts the row back with the line', async () => {
    mockUpdate.mockResolvedValue({ data: null, error: null });
    mount([task('a', 'done')]);

    await act(async () => {
      fireEvent.click(row(/Hang a/));
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'true');
    expect(row(/Hang a/)).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('alert')).toHaveTextContent(/is as it was/);
  });

  it('tick then untick never shows the first value again while the second is in flight', async () => {
    const first = deferred<{ data: unknown; error: unknown }>();
    const second = deferred<{ data: unknown; error: unknown }>();
    mockUpdate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const client = mount([task('a', 'todo')]);

    await act(async () => {
      fireEvent.click(row(/Hang a/));
    });
    await waitFor(() => expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'true'));
    await act(async () => {
      fireEvent.click(row(/Hang a/));
    });
    await waitFor(() => expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'false'));

    await act(async () => {
      first.resolve({ data: task('a', 'done'), error: null });
    });
    // The first receipt has merged (the second write only starts after it).
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect((client.getQueryData(KEY) as ReturnType<typeof task>[])[0].status).toBe('todo');
    expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {
      second.resolve({ data: task('a', 'todo'), error: null });
    });
    await waitFor(() => expect(row(/Hang a/)).not.toHaveAttribute('aria-busy'));
    expect((client.getQueryData(KEY) as ReturnType<typeof task>[])[0].status).toBe('todo');
  });
});

describe('WorkBlock add-task ghost with optimistic-ink (M13)', () => {
  const add = async (title: string) => {
    fireEvent.click(screen.getByRole('button', { name: '+ Task' }));
    fireEvent.change(screen.getByPlaceholderText('What needs doing'), { target: { value: title } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    });
  };

  it('draws the ghost at once and hands over to the receipt row', async () => {
    const write = deferred<{ data: unknown; error: unknown }>();
    mockInsert.mockReturnValue(write.promise);
    mount([task('a', 'todo')]);

    await add('Hang the mirror');
    const ghost = screen.getByText('Hang the mirror');
    expect(ghost.closest('[aria-busy]')).not.toBeNull();
    const sent = mockInsert.mock.calls[0][0] as { id: string; title: string };
    expect(sent.title).toBe('Hang the mirror');
    expect(sent.id).toEqual(expect.any(String));

    await act(async () => {
      write.resolve({ data: { ...task(sent.id, 'todo'), title: 'Hang the mirror' }, error: null });
    });
    await waitFor(() => expect(row(/Hang the mirror/)).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getAllByText('Hang the mirror')).toHaveLength(1);
  });

  it('a refused add keeps its words with Try again, which resends the same client id', async () => {
    mockInsert.mockResolvedValueOnce({ data: null, error: { message: 'Internal Server Error' } });
    mount([task('a', 'todo')]);

    await add('Hang the mirror');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t add .Hang the mirror/));
    const first = mockInsert.mock.calls[0][0] as { id: string };

    mockInsert.mockReturnValueOnce(deferred().promise);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect((mockInsert.mock.calls[1][0] as { id: string }).id).toBe(first.id);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('WorkBlock tick with optimistic-ink OFF', () => {
  it('keeps today\'s pending-only path: no ✓ before the receipt, a second press swallowed', async () => {
    mockInk = false;
    const write = deferred<{ data: unknown; error: unknown }>();
    mockUpdate.mockReturnValue(write.promise);
    mount([task('a', 'todo')]);

    await act(async () => {
      fireEvent.click(row(/Hang a/));
    });
    expect(row(/Hang a/)).toHaveAttribute('aria-busy', 'true');
    expect(row(/Hang a/)).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {
      fireEvent.click(row(/Hang a/));
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('saving…')).toBeNull();
  });
});
