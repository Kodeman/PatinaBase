import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — mirrors use-decisions.test.ts / use-client-notifications.test.ts:
// intercept the chained query builder at the `@supabase/ssr` boundary and
// React Query so we can invoke `queryFn` directly and inspect which tables
// were actually queried, without a live database.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  eq: any;
  order: any;
  limit: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  // terminal calls — return a Promise of the result
  maybeSingle: () => Promise<BuilderResult>;
  // thenable so awaiting the chain itself resolves to result (the `.order()`
  // tail on the projects query never calls a terminal method explicitly)
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  __chain: Array<{ method: string; args: unknown[] }>;
  __result: BuilderResult;
}

function makeBuilder(initial: BuilderResult = { data: null, error: null }): MockBuilder {
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
  builder.order = record('order');
  builder.limit = record('limit');

  builder.maybeSingle = vi.fn(() => {
    builder.__chain.push({ method: 'maybeSingle', args: [] });
    return Promise.resolve(builder.__result);
  });

  builder.then = (resolve) => Promise.resolve(builder.__result).then(resolve);

  return builder;
}

// Per-table builder registry — `from('table')` returns the registered builder
// for that table, or `undefined` tracking via `wasQueried` if never touched.
const builders: Record<string, MockBuilder> = {};

function setTableResult(table: string, result: BuilderResult): MockBuilder {
  const b = makeBuilder(result);
  builders[table] = b;
  return b;
}

const fromCalls: string[] = [];

const supabaseClient = {
  auth: {
    getUser: vi.fn(() =>
      Promise.resolve({ data: { user: { id: 'designer-1' } }, error: null }),
    ),
  },
  from: vi.fn((table: string) => {
    fromCalls.push(table);
    if (!builders[table]) builders[table] = makeBuilder();
    return builders[table];
  }),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// Import AFTER mocks are wired up.
import {
  useClientProjects,
  useDesignerClientForClientUser,
} from '../use-clients';

beforeEach(() => {
  for (const k of Object.keys(builders)) delete builders[k];
  fromCalls.length = 0;
  supabaseClient.from.mockClear();
  supabaseClient.auth.getUser.mockClear();
});

describe('useDesignerClientForClientUser — relationship history', () => {
  it('scopes to the signed-in designer and deterministically caps the lookup to one row', async () => {
    const row = {
      id: 'relationship-newest',
      designer_id: 'designer-1',
      client_id: 'client-1',
      lead_id: 'lead-newest',
    };
    setTableResult('designer_clients', { data: row, error: null });

    const config = useDesignerClientForClientUser('client-1') as unknown as {
      queryFn: () => Promise<typeof row | null>;
      meta?: { errorSurface?: string };
    };

    await expect(config.queryFn()).resolves.toEqual(row);
    expect(config.meta).toEqual({ errorSurface: 'silent' });
    expect(supabaseClient.auth.getUser).toHaveBeenCalledTimes(1);

    const chain = builders['designer_clients'].__chain;
    expect(chain).toContainEqual({ method: 'eq', args: ['client_id', 'client-1'] });
    expect(chain).toContainEqual({ method: 'eq', args: ['designer_id', 'designer-1'] });
    expect(chain).toContainEqual({
      method: 'order',
      args: ['updated_at', { ascending: false }],
    });
    expect(chain).toContainEqual({
      method: 'order',
      args: ['created_at', { ascending: false }],
    });
    expect(chain).toContainEqual({ method: 'order', args: ['id', { ascending: false }] });
    expect(chain).toContainEqual({ method: 'limit', args: [1] });
    expect(chain.at(-1)?.method).toBe('maybeSingle');
  });

  it('treats a signed-out or no-match lookup as an ordinary null result', async () => {
    supabaseClient.auth.getUser.mockImplementationOnce(async () =>
      ({ data: { user: null }, error: null }) as any,
    );

    const signedOut = useDesignerClientForClientUser('client-1') as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await expect(signedOut.queryFn()).resolves.toBeNull();
    expect(fromCalls).toEqual([]);

    setTableResult('designer_clients', { data: null, error: null });
    const missing = useDesignerClientForClientUser('client-1') as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await expect(missing.queryFn()).resolves.toBeNull();
  });
});

describe('useClientProjects — no-login household guard (I63)', () => {
  it('returns [] and never queries projects when the resolved client_id is null', async () => {
    // A no-login household: designer_clients.client_id is NULL.
    setTableResult('designer_clients', {
      data: { client_id: null, designer_id: 'designer-1' },
      error: null,
    });

    const config = useClientProjects('dc-no-login') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    const result = await config.queryFn();

    expect(result).toEqual([]);
    // The whole point of the guard: supabase-js would otherwise serialize
    // `.eq('client_id', null)` as the literal `eq.null`, which Postgres
    // rejects on a uuid column (400 / 22P02). Prove the second query was
    // never issued at all.
    expect(fromCalls).toEqual(['designer_clients']);
    expect(builders['projects']).toBeUndefined();
  });

  it('returns [] without querying projects when the designer_clients row is missing', async () => {
    setTableResult('designer_clients', { data: null, error: null });

    const config = useClientProjects('dc-missing') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    const result = await config.queryFn();

    expect(result).toEqual([]);
    expect(builders['projects']).toBeUndefined();
  });

  it('queries projects scoped to designer_id + client_id when client_id resolves', async () => {
    setTableResult('designer_clients', {
      data: { client_id: 'profile-1', designer_id: 'designer-1' },
      error: null,
    });
    setTableResult('projects', { data: [{ id: 'proj-1' }], error: null });

    const config = useClientProjects('dc-login') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    const result = await config.queryFn();

    expect(result).toEqual([{ id: 'proj-1' }]);
    const projectEqs = builders['projects'].__chain.filter((c) => c.method === 'eq');
    expect(
      projectEqs.some((c) => c.args[0] === 'designer_id' && c.args[1] === 'designer-1'),
    ).toBe(true);
    expect(
      projectEqs.some((c) => c.args[0] === 'client_id' && c.args[1] === 'profile-1'),
    ).toBe(true);
  });
});
