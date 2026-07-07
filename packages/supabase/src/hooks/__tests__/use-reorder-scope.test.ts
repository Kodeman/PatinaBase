import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Reorder RPC hooks (Schedule & Boards Wave 1 · S3). Verifies: the RPC name +
// args passed to supabase.rpc, the optimistic cache reorder in onMutate, and the
// rollback in onError. react-query + @supabase/ssr are mocked so the mutation
// config object is inspected directly (mirrors use-boards.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

const rpc = vi.fn(async () => ({ data: null, error: null as unknown }));
const supabaseClient = { rpc, from: vi.fn() };

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

// A minimal controllable query cache.
const store = new Map<string, unknown>();
const cancelQueries = vi.fn(async () => {});
const invalidateQueries = vi.fn();
const getQueryData = vi.fn((key: unknown) => store.get(JSON.stringify(key)));
const setQueryData = vi.fn((key: unknown, updater: unknown) => {
  const k = JSON.stringify(key);
  const cur = store.get(k);
  const next = typeof updater === 'function' ? (updater as (v: unknown) => unknown)(cur) : updater;
  store.set(k, next);
  return next;
});
const queryClient = { cancelQueries, invalidateQueries, getQueryData, setQueryData };

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => queryClient,
}));

import { useReorderProposalItems, useReorderProposalScopeRooms } from '../use-scope-builder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutationConfig = any;

beforeEach(() => {
  store.clear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  cancelQueries.mockClear();
  invalidateQueries.mockClear();
  getQueryData.mockClear();
  setQueryData.mockClear();
});

describe('useReorderProposalItems', () => {
  it('calls the reorder_proposal_items RPC with the proposal id + ordered ids', async () => {
    const cfg = useReorderProposalItems() as MutationConfig;
    await cfg.mutationFn({ proposalId: 'p1', orderedIds: ['c', 'a', 'b'] });
    expect(rpc).toHaveBeenCalledWith('reorder_proposal_items', {
      p_proposal_id: 'p1',
      p_ordered_ids: ['c', 'a', 'b'],
    });
  });

  it('throws when the RPC returns an error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('rls reject') });
    const cfg = useReorderProposalItems() as MutationConfig;
    await expect(cfg.mutationFn({ proposalId: 'p1', orderedIds: ['a'] })).rejects.toThrow(
      'rls reject'
    );
  });

  it('optimistically reorders the schedule cache and rolls back on error', async () => {
    const key = ['proposal-items-schedule', 'p1'];
    store.set(
      JSON.stringify(key),
      [
        { id: 'a', position: 0 },
        { id: 'b', position: 1 },
        { id: 'c', position: 2 },
      ]
    );

    const cfg = useReorderProposalItems() as MutationConfig;
    const ctx = await cfg.onMutate({ proposalId: 'p1', orderedIds: ['c', 'a', 'b'] });

    // Optimistic order applied (position = new index, then sorted).
    const after = store.get(JSON.stringify(key)) as Array<{ id: string; position: number }>;
    expect(after.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect(after.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: key });

    // Rollback restores the snapshot captured in context.
    cfg.onError(new Error('boom'), { proposalId: 'p1', orderedIds: ['c', 'a', 'b'] }, ctx);
    const restored = store.get(JSON.stringify(key)) as Array<{ id: string }>;
    expect(restored.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('invalidates schedule + summary on settle', () => {
    const cfg = useReorderProposalItems() as MutationConfig;
    cfg.onSettled(null, null, { proposalId: 'p1', orderedIds: ['a'] });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposal-items-schedule', 'p1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['scope-builder-summary', 'p1'] });
  });
});

describe('useReorderProposalScopeRooms', () => {
  it('calls the reorder_proposal_scope_rooms RPC with the ordered room ids', async () => {
    const cfg = useReorderProposalScopeRooms() as MutationConfig;
    await cfg.mutationFn({ proposalId: 'p1', orderedIds: ['r2', 'r1'] });
    expect(rpc).toHaveBeenCalledWith('reorder_proposal_scope_rooms', {
      p_proposal_id: 'p1',
      p_ordered_ids: ['r2', 'r1'],
    });
  });

  it('optimistically reorders the rooms cache and rolls back on error', async () => {
    const key = ['proposal-scope-rooms', 'p1'];
    store.set(
      JSON.stringify(key),
      [
        { id: 'r1', sort_order: 0 },
        { id: 'r2', sort_order: 1 },
        { id: 'r3', sort_order: 2 },
      ]
    );

    const cfg = useReorderProposalScopeRooms() as MutationConfig;
    const ctx = await cfg.onMutate({ proposalId: 'p1', orderedIds: ['r2', 'r3', 'r1'] });

    const after = store.get(JSON.stringify(key)) as Array<{ id: string; sort_order: number }>;
    expect(after.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
    expect(after.map((r) => r.sort_order)).toEqual([0, 1, 2]);

    cfg.onError(new Error('boom'), { proposalId: 'p1', orderedIds: ['r2', 'r3', 'r1'] }, ctx);
    const restored = store.get(JSON.stringify(key)) as Array<{ id: string }>;
    expect(restored.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
  });
});
