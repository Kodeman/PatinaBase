import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { method: string; args: unknown[] };
const calls: Call[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'select', 'eq', 'not', 'in', 'rpc']) {
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

import { useNeedStates, useSetNeedState, type SetNeedStateInput } from '../use-need-states';

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

describe('useSetNeedState (SQ-778 N5)', () => {
  type MutationConfig = { mutationFn: (input: SetNeedStateInput) => Promise<void> };
  const rpcArgs = () => calls.find((c) => c.method === 'rpc')?.args;

  it('names a Day Sheet line by its engagement, with no project id', async () => {
    const mutation = useSetNeedState() as unknown as MutationConfig;
    await mutation.mutationFn({ needKey: 'proposal_viewed:prop-1', engagementId: 'prop-1', action: 'not_today', until: '2026-10-12' });
    expect(rpcArgs()).toEqual(['set_need_state', expect.objectContaining({
      p_need_key: 'proposal_viewed:prop-1',
      p_project_id: null,
      p_engagement_id: 'prop-1',
      p_action: 'not_today',
      p_until: '2026-10-12',
    })]);
  });

  it('names a known project as before, with no engagement id', async () => {
    const mutation = useSetNeedState() as unknown as MutationConfig;
    await mutation.mutationFn({ needKey: 'handoff:project-1', projectId: 'project-1', action: 'acted' });
    const args = rpcArgs()?.[1] as Record<string, unknown>;
    expect(args.p_project_id).toBe('project-1');
    expect('p_engagement_id' in args).toBe(false);
  });

  it('throws a refused write, so the Day Sheet says it did not save', async () => {
    result = { data: null, error: new Error('not permitted') };
    const mutation = useSetNeedState() as unknown as MutationConfig;
    await expect(mutation.mutationFn({ needKey: 'k', engagementId: 'e', action: 'acted' })).rejects.toThrow('not permitted');
  });
});
