import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: unknown };
interface ShareBuilder {
  calls: Array<[string, unknown[]]>;
  select: (...args: unknown[]) => ShareBuilder;
  eq: (...args: unknown[]) => ShareBuilder;
  order: (...args: unknown[]) => ShareBuilder;
  then: (resolve: (input: Result) => unknown) => Promise<unknown>;
}

function builder(result: Result = { data: [], error: null }): ShareBuilder {
  const calls: Array<[string, unknown[]]> = [];
  const value = {} as ShareBuilder;
  value.calls = calls;
  value.select = vi.fn((...args: unknown[]) => {
      calls.push(['select', args]);
      return value;
    });
  value.eq = vi.fn((...args: unknown[]) => {
      calls.push(['eq', args]);
      return value;
    });
  value.order = vi.fn((...args: unknown[]) => {
      calls.push(['order', args]);
      return value;
    });
  value.then = (resolve: (input: Result) => unknown) => Promise.resolve(result).then(resolve);
  return value;
}

let nextBuilder = builder();
const from = vi.fn(() => nextBuilder);
const rpc = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, rpc }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  useBoardShares,
  useCreateBoardShare,
  useRevokeShare,
} from '../use-document-shares';

describe('board document shares', () => {
  beforeEach(() => {
    nextBuilder = builder();
    from.mockClear();
    rpc.mockReset();
    invalidateQueries.mockClear();
  });

  it('lists only the addressed board with its management metadata', async () => {
    const query = useBoardShares('board-1') as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown[]>;
    };

    await query.queryFn();
    expect(query.queryKey).toEqual(['board-shares', 'board-1']);
    expect(from).toHaveBeenCalledWith('document_shares');
    expect(nextBuilder.eq).toHaveBeenCalledWith('board_id', 'board-1');
    expect(nextBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('mints through the board-only RPC and invalidates no token-bearing cache', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'share-1', token: 'raw-once' }], error: null });
    const mutation = useCreateBoardShare() as unknown as {
      mutationFn: (input: { boardId: string; label: string }) => Promise<unknown>;
      onSuccess: (result: unknown, input: { boardId: string }) => void;
    };

    const result = await mutation.mutationFn({ boardId: 'board-1', label: 'Client view' });
    expect(result).toEqual({ id: 'share-1', token: 'raw-once' });
    expect(rpc).toHaveBeenCalledWith('create_board_share', {
      p_board_id: 'board-1',
      p_label: 'Client view',
      p_expires_at: null,
    });
    mutation.onSuccess(result, { boardId: 'board-1' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['board-shares', 'board-1'] });
  });

  it('revokes through the shared RPC and refreshes the board list', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const mutation = useRevokeShare() as unknown as {
      mutationFn: (input: { shareId: string; boardId: string }) => Promise<void>;
      onSuccess: (result: unknown, input: { shareId: string; boardId: string }) => void;
    };

    await mutation.mutationFn({ shareId: 'share-1', boardId: 'board-1' });
    expect(rpc).toHaveBeenCalledWith('revoke_document_share', { p_share_id: 'share-1' });
    mutation.onSuccess(undefined, { shareId: 'share-1', boardId: 'board-1' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['board-shares', 'board-1'] });
  });
});
