import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — mirror use-decisions.test.ts: intercept the chained query builder at
// the `@supabase/ssr` boundary and React Query so we can invoke `queryFn`
// directly and inspect the recorded chain. This lets us assert the *security
// scoping* of the decisions query without a live database.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  eq: any;
  neq: any;
  in: any;
  order: any;
  limit: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  __chain: Array<{ method: string; args: unknown[] }>;
  __result: BuilderResult;
}

function makeBuilder(initial: BuilderResult = { data: [], error: null }): MockBuilder {
  const builder = {
    __chain: [] as Array<{ method: string; args: unknown[] }>,
    __result: initial,
  } as MockBuilder;

  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      builder.__chain.push({ method, args });
      return builder;
    });

  builder.select = record('select');
  builder.eq = record('eq');
  builder.neq = record('neq');
  builder.in = record('in');
  builder.order = record('order');
  builder.limit = record('limit');
  builder.then = (resolve) => Promise.resolve(builder.__result).then(resolve);

  return builder;
}

const builders: Record<string, MockBuilder> = {};

function setTableResult(table: string, result: BuilderResult): MockBuilder {
  const b = makeBuilder(result);
  builders[table] = b;
  return b;
}

const supabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
  rpc: vi.fn(),
  from: vi.fn((table: string) => {
    if (!builders[table]) builders[table] = makeBuilder();
    return builders[table];
  }),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER mocks are wired up.
import {
  useClientNotifications,
  type ClientNotification,
} from '../use-client-notifications';

function callsTo(builder: MockBuilder, method: string) {
  return builder.__chain.filter((c) => c.method === method);
}

beforeEach(() => {
  for (const k of Object.keys(builders)) delete builders[k];
  supabaseClient.auth.getUser.mockReset();
  supabaseClient.auth.getUser.mockResolvedValue({
    data: { user: { id: 'signed-in-client' } },
    error: null,
  });
  supabaseClient.rpc.mockReset();
  supabaseClient.rpc.mockResolvedValue({ data: [], error: null });
  supabaseClient.from.mockClear();
  invalidateQueries.mockReset();
});

describe('useClientNotifications — decision scoping (security)', () => {
  it('scopes pending decisions to the signed-in client via designer_clients.client_id', async () => {
    setTableResult('client_decisions', { data: [], error: null });
    setTableResult('proposals', { data: [], error: null });
    setTableResult('scope_change_requests', { data: [], error: null });

    const config = useClientNotifications() as unknown as { queryFn: () => Promise<unknown> };
    await config.queryFn();

    const builder = builders['client_decisions'];

    // The SELECT must inner-join designer_clients so the client_id filter is
    // an actual join constraint (not a no-op on a missing embed).
    const selects = callsTo(builder, 'select');
    expect(selects).toHaveLength(1);
    expect(String(selects[0].args[0])).toContain('designer_clients!inner(client_id)');

    // The row set must be filtered to THIS client — the leak fix. Without this
    // eq(), a designer signed into the client portal sees their clients'
    // decisions as "Decision needed".
    const eqs = callsTo(builder, 'eq');
    expect(
      eqs.some((c) => c.args[0] === 'status' && c.args[1] === 'pending'),
    ).toBe(true);
    expect(
      eqs.some(
        (c) => c.args[0] === 'designer_clients.client_id' && c.args[1] === 'signed-in-client',
      ),
    ).toBe(true);
  });

  it('reads proposals only through the authenticated client-safe RPC', async () => {
    setTableResult('client_decisions', { data: [], error: null });
    setTableResult('proposals', { data: [], error: null });
    setTableResult('scope_change_requests', { data: [], error: null });

    const config = useClientNotifications() as unknown as { queryFn: () => Promise<unknown> };
    await config.queryFn();

    expect(supabaseClient.rpc).toHaveBeenCalledWith('list_client_proposals');
    expect(supabaseClient.from).not.toHaveBeenCalledWith('proposals');
  });

  it('returns an empty feed when there is no signed-in user', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const config = useClientNotifications() as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    const result = await config.queryFn();
    expect(result).toEqual([]);
    // No decisions query should have been issued without a user.
    expect(builders['client_decisions']).toBeUndefined();
  });

  it('maps the scoped decision rows into the notification feed', async () => {
    setTableResult('client_decisions', {
      data: [
        {
          id: 'dec-1',
          title: 'Pick a sofa',
          due_date: null,
          status: 'pending',
          created_at: '2026-02-14T10:00:00Z',
          project_id: 'proj-1',
        },
      ],
      error: null,
    });
    setTableResult('proposals', { data: [], error: null });
    setTableResult('scope_change_requests', { data: [], error: null });

    const config = useClientNotifications() as unknown as {
      queryFn: () => Promise<Array<{ id: string; kind: string; url: string; message: string }>>;
    };
    const result = await config.queryFn();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'decision-dec-1',
      kind: 'decision',
      url: '/decisions/dec-1',
      message: 'Pick a sofa',
    });
  });

  it('filters the safe proposal list to live review notifications', async () => {
    setTableResult('client_decisions', { data: [], error: null });
    setTableResult('scope_change_requests', { data: [], error: null });
    supabaseClient.rpc.mockResolvedValue({
      data: [
        {
          id: 'proposal-sent',
          title: 'Sent proposal',
          status: 'sent',
          sent_at: '2026-02-15T10:00:00Z',
          created_at: '2026-02-14T10:00:00Z',
        },
        {
          id: 'proposal-accepted',
          title: 'Accepted proposal',
          status: 'accepted',
          sent_at: '2026-02-13T10:00:00Z',
          created_at: '2026-02-12T10:00:00Z',
        },
      ],
      error: null,
    });

    const config = useClientNotifications() as unknown as {
      queryFn: () => Promise<ClientNotification[]>;
    };
    const result = await config.queryFn();

    expect(result.map((notification) => notification.id)).toEqual([
      'proposal-proposal-sent',
    ]);
  });
});
