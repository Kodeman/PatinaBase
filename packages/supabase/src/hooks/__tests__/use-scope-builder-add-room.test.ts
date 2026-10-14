import { beforeEach, describe, expect, it, vi } from 'vitest';

const getQueryData = vi.fn();
const invalidateQueries = vi.fn(() => Promise.resolve());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ getQueryData, invalidateQueries }),
}));

const single = vi.fn();
const insert = vi.fn(() => ({ select: () => ({ single }) }));
const limit = vi.fn();
const select = vi.fn();
const read: Record<string, unknown> = { select, eq: () => read, order: () => read, limit };
select.mockImplementation(() => read);
const from = vi.fn(() => ({ select, insert }));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, rpc: vi.fn() }),
}));

import { useAddScopeRoom } from '../use-scope-builder';

type MutationConfig = { mutationFn: (variables: Record<string, unknown>) => Promise<unknown> };

beforeEach(() => {
  getQueryData.mockReset();
  from.mockClear();
  insert.mockClear();
  select.mockClear();
  limit.mockReset();
  limit.mockResolvedValue({ data: [{ sort_order: 9 }], error: null });
  single.mockReset();
  single.mockImplementation(async () => ({ data: { id: 'row' }, error: null }));
});

describe('useAddScopeRoom client id (SQ-1001 #8)', () => {
  it('writes the client id as the row id in one insert, ordered after the cached rooms', async () => {
    getQueryData.mockReturnValue([{ sort_order: 0 }, { sort_order: 4 }]);
    const config = useAddScopeRoom() as unknown as MutationConfig;

    await config.mutationFn({ proposalId: 'proposal-1', name: 'Library', clientRoomId: 'client-room-1' });

    expect(getQueryData).toHaveBeenCalledWith(['proposal-scope-rooms', 'proposal-1']);
    expect(from).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'client-room-1',
        proposal_id: 'proposal-1',
        name: 'Library',
        sort_order: 5,
      }),
    );
  });

  it('leaves the order to the column default when no rooms are cached', async () => {
    getQueryData.mockReturnValue(undefined);
    const config = useAddScopeRoom() as unknown as MutationConfig;

    await config.mutationFn({ proposalId: 'proposal-1', name: 'Library', clientRoomId: 'client-room-2' });

    expect(from).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    const row = (insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row.id).toBe('client-room-2');
    expect(row).not.toHaveProperty('sort_order');
  });

  it('without a client id (flag off) still reads the last order and lets the server mint the id', async () => {
    limit.mockResolvedValue({ data: [{ sort_order: 2 }], error: null });
    const config = useAddScopeRoom() as unknown as MutationConfig;

    await config.mutationFn({ proposalId: 'proposal-1', name: 'Dining' });

    expect(select).toHaveBeenCalledWith('sort_order');
    expect(getQueryData).not.toHaveBeenCalled();
    const row = (insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('id');
    expect(row).toMatchObject({ proposal_id: 'proposal-1', name: 'Dining', sort_order: 3 });
  });
});
