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
  chain.auth = { getSession: async () => ({ data: { session: sessionUserId ? { user: { id: sessionUserId } } : null } }) };
  return chain;
}
let sessionUserId: string | null = 'me';

vi.mock('../../client', () => ({ createBrowserClient: () => builder() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useNeedStates, useSetNeedState, useTeammateActed, type SetNeedStateInput } from '../use-need-states';

type QueryConfig<T> = { queryFn: () => Promise<T>; enabled?: boolean };

beforeEach(() => {
  calls.length = 0;
  result = { data: [], error: null };
  sessionUserId = 'me';
});

describe('useNeedStates (walk W-D1)', () => {
  it('reads her own rows across studios, never only the Desk studio’s', async () => {
    result = {
      data: [{
        user_id: 'me',
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
    // Her user id is the only filter — never the Desk's studio (W-D1).
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([['user_id', 'me']]);
    expect(states.get('overdue_invoice:inv-1')?.deferredUntil).toBe('2026-10-12');
  });

  it('keeps her own state when a teammate filed the same need (US-28 S5b)', async () => {
    result = {
      data: [
        { user_id: 'jordan', need_key: 'po_unsent:po-1', project_id: 'p1', deferred_until: '2026-10-20', acted_at: null, waiting_on: null, set_aside_until: null, set_aside_reason: null, updated_at: '2026-10-12T09:00:00Z' },
        { user_id: 'me', need_key: 'po_unsent:po-1', project_id: 'p1', deferred_until: null, acted_at: '2026-10-12T09:30:00Z', waiting_on: 'the maker', set_aside_until: null, set_aside_reason: null, updated_at: '2026-10-12T09:30:00Z' },
      ],
      error: null,
    };
    const query = useNeedStates('studio-a') as unknown as QueryConfig<Map<string, { actedAt: string | null; deferredUntil: string | null; updatedAt: string | null }>>;
    const states = await query.queryFn();
    expect(states.size).toBe(1);
    expect(states.get('po_unsent:po-1')).toMatchObject({ actedAt: '2026-10-12T09:30:00Z', deferredUntil: null, updatedAt: '2026-10-12T09:30:00Z' });
  });

  it('reads nothing with no session', async () => {
    sessionUserId = null;
    const query = useNeedStates('studio-a') as unknown as QueryConfig<Map<string, unknown>>;
    expect((await query.queryFn()).size).toBe(0);
    expect(calls.some((c) => c.method === 'from')).toBe(false);
  });
});

describe('useTeammateActed (US-28 S5b)', () => {
  it('reads facts from the RPC, never the table, keeping every teammate on one need', async () => {
    result = {
      data: [
        { user_id: 'jordan', organization_id: 'studio-a', project_id: null, need_key: 'new_lead:i-1', acted_at: '2026-10-12T09:30:00Z' },
        { user_id: 'sam', organization_id: 'studio-a', project_id: null, need_key: 'new_lead:i-1', acted_at: '2026-10-12T08:00:00Z' },
      ],
      error: null,
    };
    const query = useTeammateActed('studio-a') as unknown as QueryConfig<Map<string, { userId: string; actedAt: string }[]>>;
    const facts = await query.queryFn();
    expect(calls.find((c) => c.method === 'rpc')?.args).toEqual(['studio_need_state_facts']);
    expect(calls.some((c) => c.method === 'from')).toBe(false);
    expect(facts.get('new_lead:i-1')).toEqual([
      { userId: 'jordan', actedAt: '2026-10-12T09:30:00Z' },
      { userId: 'sam', actedAt: '2026-10-12T08:00:00Z' },
    ]);
  });

  it('waits for a studio', () => {
    expect((useTeammateActed('') as unknown as QueryConfig<unknown>).enabled).toBe(false);
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
