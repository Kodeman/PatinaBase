/**
 * `useClientRoomScans` after the Wave 1P union (spec §11.2): the designer's own
 * ready scans join her client's, each row stamped with WHOSE it is so the
 * client-provenance instrument does not silently start meaning something else.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type BuilderResult = { data: unknown; error: unknown };

const results: Record<string, BuilderResult[]> = {};
const defaults: Record<string, BuilderResult> = {};
const calls: Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }> = [];

function makeBuilder(table: string) {
  const chain: Array<{ method: string; args: unknown[] }> = [];
  calls.push({ table, chain });
  const take = (): BuilderResult =>
    results[table]?.shift() ?? defaults[table] ?? { data: null, error: null };
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      chain.push({ method, args });
      return builder;
    });
  const builder = {
    select: record('select'),
    eq: record('eq'),
    order: record('order'),
    maybeSingle: vi.fn(async () => take()),
    then: (resolve: (v: BuilderResult) => unknown) => Promise.resolve(take()).then(resolve),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return builder;
}

const from = vi.fn((table: string) => makeBuilder(table));
let user: { id: string } | null = { id: 'designer-uid' };
const getUser = vi.fn(async () => ({ data: { user }, error: null }));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, auth: { getUser } }),
}));

interface QueryConfig {
  queryKey: readonly unknown[];
  enabled: boolean;
  queryFn: () => Promise<unknown>;
}
let issued: QueryConfig[] = [];
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: Record<string, unknown>) => {
    issued.push(config as unknown as QueryConfig);
    return config;
  },
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useClientRoomScans } from '../use-room-scans';

function query(): QueryConfig {
  const found = issued.at(-1);
  if (!found) throw new Error('useClientRoomScans issued no query');
  return found;
}

function scan(id: string, userId: string, createdAt = '2026-08-01T00:00:00Z') {
  return { id, user_id: userId, name: id, status: 'ready', created_at: createdAt };
}

beforeEach(() => {
  for (const key of Object.keys(results)) delete results[key];
  for (const key of Object.keys(defaults)) delete defaults[key];
  calls.length = 0;
  issued = [];
  user = { id: 'designer-uid' };
  from.mockClear();
  getUser.mockClear();
});

describe('useClientRoomScans — the designer-scan union', () => {
  it("returns the client's scans AND the designer's own, each stamped with whose it is", async () => {
    defaults.designer_clients = { data: { client_id: 'client-uid' }, error: null };
    results.room_scans = [
      { data: [scan('client-scan', 'client-uid')], error: null },
      { data: [scan('my-scan', 'designer-uid')], error: null },
    ];

    useClientRoomScans('dc-1');
    const rows = (await query().queryFn()) as Array<{ id: string; owner_kind: string }>;

    expect(rows.map((r) => [r.id, r.owner_kind])).toEqual(
      expect.arrayContaining([
        ['client-scan', 'client'],
        ['my-scan', 'designer'],
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it('sorts the merged list newest-first', async () => {
    defaults.designer_clients = { data: { client_id: 'client-uid' }, error: null };
    results.room_scans = [
      { data: [scan('older-client', 'client-uid', '2026-01-01T00:00:00Z')], error: null },
      { data: [scan('newer-mine', 'designer-uid', '2026-08-01T00:00:00Z')], error: null },
    ];

    useClientRoomScans('dc-1');
    const rows = (await query().queryFn()) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(['newer-mine', 'older-client']);
  });

  it('never lists the same scan twice when the designer IS the client', async () => {
    defaults.designer_clients = { data: { client_id: 'designer-uid' }, error: null };
    results.room_scans = [
      { data: [scan('one', 'designer-uid')], error: null },
      { data: [scan('one', 'designer-uid')], error: null },
    ];

    useClientRoomScans('dc-1');
    const rows = (await query().queryFn()) as Array<{ id: string; owner_kind: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].owner_kind).toBe('designer');
  });

  it("still returns the designer's own scans when the relationship row is missing", async () => {
    // Before this change the hook returned [] here — the exact reason a designer
    // could not attach her own scan to her own document.
    defaults.designer_clients = { data: null, error: null };
    results.room_scans = [{ data: [scan('my-scan', 'designer-uid')], error: null }];

    useClientRoomScans('dc-1');
    const rows = (await query().queryFn()) as Array<{ id: string; owner_kind: string }>;

    expect(rows.map((r) => r.id)).toEqual(['my-scan']);
    expect(rows[0].owner_kind).toBe('designer');
  });

  it('returns only the client leg when nobody is signed in', async () => {
    user = null;
    defaults.designer_clients = { data: { client_id: 'client-uid' }, error: null };
    results.room_scans = [{ data: [scan('client-scan', 'client-uid')], error: null }];

    useClientRoomScans('dc-1');
    const rows = (await query().queryFn()) as Array<{ id: string }>;

    expect(rows.map((r) => r.id)).toEqual(['client-scan']);
  });

  it('reads only ready scans on both legs', async () => {
    defaults.designer_clients = { data: { client_id: 'client-uid' }, error: null };
    defaults.room_scans = { data: [], error: null };

    useClientRoomScans('dc-1');
    await query().queryFn();

    const scanCalls = calls.filter((c) => c.table === 'room_scans');
    expect(scanCalls).toHaveLength(2);
    for (const c of scanCalls) {
      expect(c.chain).toContainEqual({ method: 'eq', args: ['status', 'ready'] });
    }
  });
});
