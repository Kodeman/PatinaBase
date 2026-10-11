import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { method: string; args: unknown[] };
const calls: Call[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'select', 'eq', 'not', 'in']) {
    chain[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    });
  }
  chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

vi.mock('../../client', () => ({ createBrowserClient: () => builder() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useNeedStateProjectIds, useNeedStates } from '../use-need-states';

type QueryConfig<T> = { queryFn: () => Promise<T>; enabled?: boolean };

beforeEach(() => {
  calls.length = 0;
  result = { data: [], error: null };
});

describe('useNeedStates (walk W-D1)', () => {
  it('reads her own rows across studios, never only the Desk studio’s', async () => {
    result = {
      data: [{
        need_key: 'overdue_invoice:inv-1',
        project_id: 'project-in-studio-b',
        deferred_until: '2026-10-12',
        acted_at: null,
        waiting_on: null,
        set_aside_until: null,
        set_aside_reason: null,
      }],
      error: null,
    };
    const query = useNeedStates('studio-a') as unknown as QueryConfig<Map<string, { deferredUntil: string | null }>>;
    const states = await query.queryFn();
    expect(calls.find((c) => c.method === 'from')?.args).toEqual(['studio_need_states']);
    expect(calls.some((c) => c.method === 'eq')).toBe(false);
    expect(states.get('overdue_invoice:inv-1')?.deferredUntil).toBe('2026-10-12');
  });
});

describe('useNeedStateProjectIds (SQ-751 F6, walk W-D3)', () => {
  it('names only projects that belong to a studio', async () => {
    result = { data: [{ id: 'project-1' }], error: null };
    const query = useNeedStateProjectIds() as unknown as QueryConfig<Set<string>>;
    const ids = await query.queryFn();
    expect(calls.find((c) => c.method === 'from')?.args).toEqual(['projects']);
    expect(calls.find((c) => c.method === 'not')?.args).toEqual(['studio_id', 'is', null]);
    expect([...ids]).toEqual(['project-1']);
  });

  it('throws on a failed read, so no control is offered on a guess', async () => {
    result = { data: null, error: new Error('boom') };
    const query = useNeedStateProjectIds() as unknown as QueryConfig<Set<string>>;
    await expect(query.queryFn()).rejects.toThrow('boom');
  });
});
