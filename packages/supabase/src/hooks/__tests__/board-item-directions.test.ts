import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const select = vi.fn(() => ({ single: vi.fn() }));
const from = vi.fn(() => ({ insert: (...args: unknown[]) => { insert(...args); return { select }; } }));
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
  countUnresolvedDirectionsByItem,
  useAddBoardItemDirection,
  useResolveBoardItemDirection,
  useReopenBoardItemDirection,
  type BoardItemDirection,
} from '../board-item-directions';

function direction(overrides: Partial<BoardItemDirection>): BoardItemDirection {
  return {
    id: 'direction-1',
    board_item_id: 'pin-1',
    author_id: 'user-1',
    body: 'Swap the sconce.',
    resolved: false,
    resolved_at: null,
    resolved_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('countUnresolvedDirectionsByItem', () => {
  it('counts only unresolved notes, grouped per pin', () => {
    const counts = countUnresolvedDirectionsByItem([
      direction({ id: 'a', board_item_id: 'pin-1', resolved: false }),
      direction({ id: 'b', board_item_id: 'pin-1', resolved: false }),
      direction({ id: 'c', board_item_id: 'pin-1', resolved: true }),
      direction({ id: 'd', board_item_id: 'pin-2', resolved: false }),
    ]);
    expect(counts.get('pin-1')).toBe(2);
    expect(counts.get('pin-2')).toBe(1);
  });

  it('omits a pin entirely once every note on it is resolved', () => {
    const counts = countUnresolvedDirectionsByItem([
      direction({ id: 'a', board_item_id: 'pin-1', resolved: true }),
    ]);
    expect(counts.has('pin-1')).toBe(false);
  });

  it('returns an empty map for no directions', () => {
    expect(countUnresolvedDirectionsByItem([]).size).toBe(0);
  });
});

describe('useAddBoardItemDirection validation', () => {
  beforeEach(() => {
    from.mockClear();
    insert.mockClear();
    invalidateQueries.mockClear();
  });

  it('rejects a blank body before issuing a write', async () => {
    const mutation = useAddBoardItemDirection() as unknown as {
      mutationFn: (input: { boardId: string; boardItemId: string; body: string }) => Promise<unknown>;
    };

    await expect(
      mutation.mutationFn({ boardId: 'board-1', boardItemId: 'pin-1', body: '   ' }),
    ).rejects.toThrow('A direction note needs a body.');
    expect(from).not.toHaveBeenCalled();
  });

  it('trims the body and inserts against the pin, never sending author_id', async () => {
    const mutation = useAddBoardItemDirection() as unknown as {
      mutationFn: (input: { boardId: string; boardItemId: string; body: string }) => Promise<unknown>;
      onSuccess: (result: unknown, input: { boardId: string }) => void;
    };

    select.mockReturnValueOnce({ single: vi.fn().mockResolvedValue({ data: direction({}), error: null }) });

    await mutation.mutationFn({ boardId: 'board-1', boardItemId: 'pin-1', body: '  Swap the sconce.  ' });

    expect(from).toHaveBeenCalledWith('board_item_directions');
    expect(insert).toHaveBeenCalledWith({ board_item_id: 'pin-1', body: 'Swap the sconce.' });
    const insertedPayload = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedPayload).not.toHaveProperty('author_id');

    mutation.onSuccess(direction({}), { boardId: 'board-1' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['board-item-directions', 'board-1'] });
  });
});

describe('useResolveBoardItemDirection / useReopenBoardItemDirection', () => {
  beforeEach(() => {
    rpc.mockClear();
    invalidateQueries.mockClear();
  });

  it('resolve calls the resolve RPC with the direction id and invalidates the board list', async () => {
    rpc.mockResolvedValueOnce({ data: direction({ resolved: true }), error: null });
    const mutation = useResolveBoardItemDirection() as unknown as {
      mutationFn: (input: { boardId: string; directionId: string }) => Promise<unknown>;
      onSuccess: (result: unknown, input: { boardId: string }) => void;
    };

    await mutation.mutationFn({ boardId: 'board-1', directionId: 'direction-1' });
    expect(rpc).toHaveBeenCalledWith('resolve_board_item_direction', { p_direction_id: 'direction-1' });

    mutation.onSuccess(direction({}), { boardId: 'board-1' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['board-item-directions', 'board-1'] });
  });

  it('reopen calls the reopen RPC with the direction id', async () => {
    rpc.mockResolvedValueOnce({ data: direction({ resolved: false }), error: null });
    const mutation = useReopenBoardItemDirection() as unknown as {
      mutationFn: (input: { boardId: string; directionId: string }) => Promise<unknown>;
    };

    await mutation.mutationFn({ boardId: 'board-1', directionId: 'direction-1' });
    expect(rpc).toHaveBeenCalledWith('reopen_board_item_direction', { p_direction_id: 'direction-1' });
  });

  it('surfaces an RPC error rather than swallowing it', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('only a studio co-member may resolve direction') });
    const mutation = useResolveBoardItemDirection() as unknown as {
      mutationFn: (input: { boardId: string; directionId: string }) => Promise<unknown>;
    };

    await expect(
      mutation.mutationFn({ boardId: 'board-1', directionId: 'direction-1' }),
    ).rejects.toThrow('only a studio co-member may resolve direction');
  });
});
