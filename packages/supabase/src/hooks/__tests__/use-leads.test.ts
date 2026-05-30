import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (mirrors use-proposal-captures.test.ts / use-decisions.test.ts)
// ─────────────────────────────────────────────────────────────────────────────
//
// The hooks are tightly coupled to:
//   1) `createBrowserClient` from `@supabase/ssr` (chained query builder + auth)
//   2) `useMutation`/`useQuery`/`useQueryClient` from `@tanstack/react-query`
//
// We can't render the hooks (no jsdom), so we intercept React Query at the
// module boundary: each `useMutation`/`useQuery` call returns the config object
// verbatim, exposing `mutationFn`/`queryFn` for direct invocation.
//
// `useAcceptLead` issues MULTIPLE sequential queries against the same table
// (`designer_clients`: a `.maybeSingle()` lookup, then an `.update()` OR an
// `.insert()`). A single fixed `__result` per table can't model that, so this
// builder consumes a *queue* of terminal results per table — each terminal
// call (`single`/`maybeSingle`/awaiting the chain) pops the next queued result.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  insert: any;
  update: any;
  delete: any;
  eq: any;
  is: any;
  order: any;
  single: any;
  maybeSingle: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  // Every chain call across the table's lifetime, in order.
  __chain: Array<{ method: string; args: unknown[] }>;
  // FIFO queue of terminal results; each terminal op consumes the next entry.
  __queue: BuilderResult[];
}

function nextResult(builder: MockBuilder): BuilderResult {
  return builder.__queue.length > 0
    ? (builder.__queue.shift() as BuilderResult)
    : { data: null, error: null };
}

function makeBuilder(queue: BuilderResult[] = []): MockBuilder {
  const builder = {
    __chain: [] as Array<{ method: string; args: unknown[] }>,
    __queue: [...queue],
  } as MockBuilder;

  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      builder.__chain.push({ method, args });
      return builder;
    });

  builder.select = record('select');
  builder.insert = record('insert');
  builder.update = record('update');
  builder.delete = record('delete');
  builder.eq = record('eq');
  builder.is = record('is');
  builder.order = record('order');

  builder.single = vi.fn(() => {
    builder.__chain.push({ method: 'single', args: [] });
    return Promise.resolve(nextResult(builder));
  });

  builder.maybeSingle = vi.fn(() => {
    builder.__chain.push({ method: 'maybeSingle', args: [] });
    return Promise.resolve(nextResult(builder));
  });

  // Awaiting the chain directly (e.g. a bare `update(...).eq(...)`) is a
  // terminal op too, so it also consumes a queued result.
  builder.then = (resolve) => Promise.resolve(nextResult(builder)).then(resolve);

  return builder;
}

// Per-table builder registry — each `from('table')` returns the registered
// builder for that table (or a fresh one if unset).
const builders: Record<string, MockBuilder> = {};

function setTableQueue(table: string, queue: BuilderResult[]): MockBuilder {
  const b = makeBuilder(queue);
  builders[table] = b;
  return b;
}

const supabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
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

// Import AFTER the mocks are wired up.
import { useAcceptLead } from '../use-leads';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// useAcceptLead — manual (homeowner_id === null) capture branch
// ─────────────────────────────────────────────────────────────────────────────

const MANUAL_LEAD = {
  id: 'lead-1',
  homeowner_id: null,
  designer_id: 'designer-1',
  contact_name: 'James Chen',
  contact_email: 'james@example.com',
};

function getAcceptFn() {
  return (useAcceptLead() as unknown as {
    mutationFn: (leadId: string) => Promise<unknown>;
  }).mutationFn;
}

describe('useAcceptLead — manual lead, idempotent on idx_designer_clients_unique_email', () => {
  it('UPDATES the existing profile-less client when contact_email already matches (no throw, no insert)', async () => {
    // leads: (1) select+single returns the lead, (2) status update resolves OK.
    setTableQueue('leads', [
      { data: MANUAL_LEAD, error: null },
      { data: null, error: null },
    ]);

    // designer_clients terminal ops, in order:
    //   1. maybeSingle by lead_id        -> no row (not previously accepted)
    //   2. maybeSingle by email+null cid -> EXISTING row (email collision)
    //   3. update(...).eq(...)           -> resolves OK
    const dc = setTableQueue('designer_clients', [
      { data: null, error: null },
      { data: { id: 'client-existing' }, error: null },
      { data: null, error: null },
    ]);

    const mutationFn = getAcceptFn();
    await expect(mutationFn('lead-1')).resolves.toBeTruthy();

    // It must UPDATE, not INSERT.
    const updateCall = dc.__chain.find((c) => c.method === 'update');
    const insertCall = dc.__chain.find((c) => c.method === 'insert');
    expect(insertCall).toBeUndefined();
    expect(updateCall).toBeDefined();

    // Update keeps client_id null (not set) and carries the lead contact info.
    expect(updateCall?.args[0]).toEqual({
      client_name: 'James Chen',
      client_email: 'james@example.com',
      source: 'lead',
      lead_id: 'lead-1',
      status: 'active',
    });
    expect((updateCall?.args[0] as Record<string, unknown>).client_id).toBeUndefined();

    // It targets the existing row id.
    const updateEq = dc.__chain.find((c) => c.method === 'eq' && c.args[0] === 'id');
    expect(updateEq?.args).toEqual(['id', 'client-existing']);

    // The email lookup used the partial-index predicate columns.
    expect(dc.__chain.some((c) => c.method === 'eq' && c.args[0] === 'client_email')).toBe(true);
    expect(dc.__chain.some((c) => c.method === 'is' && c.args[0] === 'client_id' && c.args[1] === null)).toBe(true);
  });

  it('INSERTS a new profile-less client when no existing row matches', async () => {
    setTableQueue('leads', [
      { data: MANUAL_LEAD, error: null },
      { data: null, error: null },
    ]);

    // designer_clients terminal ops, in order:
    //   1. maybeSingle by lead_id        -> no row
    //   2. maybeSingle by email+null cid -> no row
    //   3. insert(...)                   -> resolves OK
    const dc = setTableQueue('designer_clients', [
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    const mutationFn = getAcceptFn();
    await expect(mutationFn('lead-1')).resolves.toBeTruthy();

    const insertCall = dc.__chain.find((c) => c.method === 'insert');
    const updateCall = dc.__chain.find((c) => c.method === 'update');
    expect(updateCall).toBeUndefined();
    expect(insertCall).toBeDefined();

    expect(insertCall?.args[0]).toEqual({
      designer_id: 'designer-1',
      client_id: null,
      client_name: 'James Chen',
      client_email: 'james@example.com',
      source: 'lead',
      lead_id: 'lead-1',
      status: 'active',
    });
  });
});
