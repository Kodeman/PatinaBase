import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (mirrors use-palettes.test.ts; adds `upsert` for useSaveBoardLayout).
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsert: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  single: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maybeSingle: any;
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
  builder.insert = record('insert');
  builder.update = record('update');
  builder.upsert = record('upsert');
  builder.delete = record('delete');
  builder.eq = record('eq');
  builder.order = record('order');

  builder.single = vi.fn(() => {
    builder.__chain.push({ method: 'single', args: [] });
    return Promise.resolve(builder.__result);
  });
  builder.maybeSingle = vi.fn(() => {
    builder.__chain.push({ method: 'maybeSingle', args: [] });
    return Promise.resolve(builder.__result);
  });

  builder.then = (resolve) => Promise.resolve(builder.__result).then(resolve);

  return builder;
}

const builderQueues: Record<string, MockBuilder[]> = {};

function pushTableResult(table: string, result: BuilderResult): MockBuilder {
  const b = makeBuilder(result);
  if (!builderQueues[table]) builderQueues[table] = [];
  builderQueues[table].push(b);
  return b;
}

const fromSpy = vi.fn((table: string) => {
  const queue = builderQueues[table];
  if (queue && queue.length > 1) return queue.shift()!;
  if (queue && queue.length === 1) return queue[0];
  const b = makeBuilder();
  builderQueues[table] = [b];
  return b;
});

const supabaseClient = { from: fromSpy };

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
import { useSaveBoardLayout, useBoardsWithItems, type BoardLayoutPosition } from '../use-boards';

beforeEach(() => {
  Object.keys(builderQueues).forEach((k) => delete builderQueues[k]);
  invalidateQueries.mockReset();
  fromSpy.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
// useSaveBoardLayout — the batch-upsert WITH-CHECK regression guard.
//
// Every upserted row MUST carry `board_id` + `type`. Without them, Postgres
// evaluates the INSERT-path RLS WITH CHECK (which joins board_id → the
// designer's proposal) against a row missing board_id and silently rejects the
// ENTIRE statement, so every layout edit is lost even though each row actually
// takes the conflict-update path. See use-boards.ts BoardLayoutPosition.
// ─────────────────────────────────────────────────────────────────────────────

describe('useSaveBoardLayout', () => {
  const positions: BoardLayoutPosition[] = [
    { id: 'i1', board_id: 'b1', type: 'product', x: 10, y: 20, z_index: 0, rotation: 0 },
    { id: 'i2', board_id: 'b1', type: 'note', x: 30, y: 40, z_index: 1, rotation: 15 },
    { id: 'i3', board_id: 'b1', type: 'palette', x: 50, y: 60, z_index: 2, rotation: 0 },
  ];

  it('upserts every row carrying board_id + type (WITH-CHECK guard)', async () => {
    const builder = pushTableResult('proposal_board_items', { data: null, error: null });

    const config = useSaveBoardLayout() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await config.mutationFn({ boardId: 'b1', positions });

    const upsert = builder.__chain.find((c) => c.method === 'upsert');
    expect(upsert, 'upsert must be called').toBeTruthy();

    const rows = upsert?.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    // The load-bearing invariant: NO row may omit board_id or type.
    for (const row of rows) {
      expect(row.board_id, `row ${row.id} missing board_id`).toBe('b1');
      expect(row.type, `row ${row.id} missing type`).toBeDefined();
      expect(typeof row.type).toBe('string');
    }
    // Layout columns ride along too.
    expect(rows[1]).toEqual(
      expect.objectContaining({ id: 'i2', board_id: 'b1', type: 'note', x: 30, y: 40, z_index: 1, rotation: 15 })
    );
    // Conflict target is the primary key so every row takes the update path.
    expect(upsert?.args[1]).toEqual({ onConflict: 'id' });
  });

  it('short-circuits without touching the client when there are no positions', async () => {
    const config = useSaveBoardLayout() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await config.mutationFn({ boardId: 'b1', positions: [] });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('throws when the upsert returns an error', async () => {
    pushTableResult('proposal_board_items', { data: null, error: new Error('rls reject') });
    const config = useSaveBoardLayout() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await expect(config.mutationFn({ boardId: 'b1', positions })).rejects.toThrow('rls reject');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useBoardsWithItems — one round trip, items inlined + z-ordered.
// ─────────────────────────────────────────────────────────────────────────────

describe('useBoardsWithItems', () => {
  it('is disabled when the proposal id is missing', () => {
    const config = useBoardsWithItems(null) as unknown as { enabled: boolean };
    expect(config.enabled).toBe(false);
  });

  it('selects boards with their items and flattens the nested rows', async () => {
    const builder = pushTableResult('proposal_boards', {
      data: [
        {
          id: 'b1',
          proposal_id: 'prop-1',
          name: 'Whole Home',
          canvas_width: 1200,
          canvas_height: 800,
          background_color: '#FAF8F5',
          sort_order: 0,
          proposal_board_items: [{ id: 'i1', board_id: 'b1', type: 'product', z_index: 0 }],
        },
      ],
      error: null,
    });

    const config = useBoardsWithItems('prop-1') as unknown as {
      queryFn: () => Promise<Array<{ items: unknown[] }>>;
    };
    const result = await config.queryFn();

    // Nested join requested.
    const select = builder.__chain.find((c) => c.method === 'select');
    expect(select?.args[0]).toContain('proposal_board_items(*)');
    // Scoped to the proposal.
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['proposal_id', 'prop-1']);
    // Flattened to BoardWithItems (items hoisted off the join key).
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('proposal_board_items');
  });

  it('throws when supabase returns an error', async () => {
    pushTableResult('proposal_boards', { data: null, error: new Error('boom') });
    const config = useBoardsWithItems('prop-1') as unknown as { queryFn: () => Promise<unknown[]> };
    await expect(config.queryFn()).rejects.toThrow('boom');
  });
});
