import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';

const rpc = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc }),
}));

// Real QueryClient, query refetch and mutation lifecycle. Only the React
// bindings are stubbed so the hook can be called outside a component.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQueryClient: vi.fn(), useMutation: vi.fn(), useMutationState: vi.fn() };
});

import { useCreateNamedProjectNeed } from '../use-project-ffe-ga';

type Line = { id: string; name: string };

const LINES = ['project-ffe-items', 'project-1', undefined] as const;
const request = {
  projectId: 'project-1',
  name: 'Reading chair',
  quantity: 1,
  itemType: 'tbd' as const,
  assignmentScope: 'unassigned' as const,
  roomId: null,
  disposition: 'candidate' as const,
  source: 'named-need' as const,
  idempotencyKey: 'need-reconcile-1',
};

let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.mocked(useQueryClient).mockReturnValue(client);
  vi.mocked(useMutation).mockImplementation((options) => options as never);
  vi.mocked(useMutationState).mockReturnValue([]);
});

afterEach(() => {
  client.clear();
  vi.useRealTimers();
});

describe('useCreateNamedProjectNeed with optimistic ink (SQ-1001 #5)', () => {
  it('keeps the line pending through a failed re-read and never sends the create twice', async () => {
    rpc.mockResolvedValue({
      data: { outcome: 'created', selectionId: 'selection-9', threadId: null, placementId: null },
      error: null,
    });
    const saved: Line = { id: 'selection-9', name: 'Reading chair' };
    const readLines = vi
      .fn<[], Promise<Line[]>>()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValue([saved]);
    client.setQueryData<Line[]>(LINES, []);
    const list = new QueryObserver(client, { queryKey: LINES, queryFn: readLines, staleTime: Infinity });
    const unsubscribe = list.subscribe(() => {});

    const hook = useCreateNamedProjectNeed({ optimistic: true });
    const create = new MutationObserver<unknown, Error, typeof request>(client, hook as never);
    const settled = create.mutate(request);

    await vi.advanceTimersByTimeAsync(0);
    // The create landed, the re-read failed: the line is still pending (its
    // ghost stays), not dropped with nothing in the list.
    expect(readLines).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(LINES)).toEqual([]);
    expect(create.getCurrentResult().isPending).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    await settled;
    // Only the read was tried again; the line is in the list as pending ends.
    expect(readLines).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(LINES)).toEqual([saved]);
    expect(create.getCurrentResult().isSuccess).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_named_project_need', { p_request: request });
    unsubscribe();
  });

  it('ends pending at the first re-read when it lands', async () => {
    rpc.mockResolvedValue({
      data: { outcome: 'created', selectionId: 'selection-10', threadId: null, placementId: null },
      error: null,
    });
    const saved: Line = { id: 'selection-10', name: 'Reading chair' };
    const readLines = vi.fn<[], Promise<Line[]>>().mockResolvedValue([saved]);
    client.setQueryData<Line[]>(LINES, []);
    const list = new QueryObserver(client, { queryKey: LINES, queryFn: readLines, staleTime: Infinity });
    const unsubscribe = list.subscribe(() => {});

    const create = new MutationObserver<unknown, Error, typeof request>(client, useCreateNamedProjectNeed({ optimistic: true }) as never);
    await create.mutate(request);

    expect(readLines).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(LINES)).toEqual([saved]);
    expect(rpc).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
