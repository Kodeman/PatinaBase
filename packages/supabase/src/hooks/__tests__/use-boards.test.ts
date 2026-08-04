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

const rpc = vi.fn();
const supabaseClient = { from: fromSpy, rpc };

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
import {
  useAddBoardItem,
  useApplyBoardRoomState,
  useBoards,
  useSaveBoardLayout,
  useBoardsWithItems,
  useDuplicateBoard,
  useUpsertBoard,
  useProjectOwnedBoards,
  summarizeBoard,
  type BoardLayoutPosition,
} from '../use-boards';

beforeEach(() => {
  Object.keys(builderQueues).forEach((k) => delete builderQueues[k]);
  invalidateQueries.mockReset();
  fromSpy.mockClear();
  rpc.mockReset();
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
    { id: 'i1', board_id: 'b1', type: 'product', x: 10, y: 20, width: 220, height: null, z_index: 0, rotation: 0 },
    { id: 'i2', board_id: 'b1', type: 'note', x: 30, y: 40, width: 180, height: 140, z_index: 1, rotation: 15 },
    { id: 'i3', board_id: 'b1', type: 'palette', x: 50, y: 60, width: 260, height: 96, z_index: 2, rotation: 0 },
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
      expect(row.width, `row ${row.id} missing width`).toBeDefined();
      expect(row).toHaveProperty('height');
    }
    // Layout columns ride along too.
    expect(rows[1]).toEqual(
      expect.objectContaining({ id: 'i2', board_id: 'b1', type: 'note', x: 30, y: 40, width: 180, height: 140, z_index: 1, rotation: 15 })
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

describe('useApplyBoardRoomState', () => {
  const input = {
    boardId: 'board-1',
    owner: { kind: 'project' as const, id: 'project-1' },
    state: {
      name: 'Living room direction',
      canvasWidth: 1200,
      canvasHeight: 800,
      backgroundColor: '#FAF8F5',
      sections: [{ id: 'section-1', name: 'Seating' }],
      items: [{
        id: '11111111-1111-4111-8111-111111111111',
        type: 'note' as const,
        x: 40,
        y: 60,
        width: 200,
        height: 120,
        zIndex: 1,
        rotation: 0,
        locked: false,
        content: 'Warm, quiet, grounded',
        data: {},
      }],
    },
  };

  it('sends one owner-scoped full-state RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const config = useApplyBoardRoomState() as unknown as {
      mutationFn: (value: typeof input) => Promise<void>;
    };

    await config.mutationFn(input);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('apply_board_room_state', {
      p_board_id: 'board-1',
      p_owner_kind: 'project',
      p_owner_id: 'project-1',
      p_state: input.state,
    });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('throws the RPC error and invalidates every owner projection on settle', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('transaction rolled back') });
    const config = useApplyBoardRoomState() as unknown as {
      mutationFn: (value: typeof input) => Promise<void>;
      onSettled: (data: undefined, error: Error, value: typeof input) => Promise<void>;
    };

    await expect(config.mutationFn(input)).rejects.toThrow('transaction rolled back');
    await config.onSettled(undefined, new Error('transaction rolled back'), input);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['board', 'board-1'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project-owned-boards', 'project-1'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project-owned-boards-with-items', 'project-1'] });
  });

  it('invalidates pin feedback after a proposal room snapshot can cascade rows', async () => {
    const config = useApplyBoardRoomState() as unknown as {
      onSettled: (
        data: undefined,
        error: null,
        value: Omit<typeof input, 'owner'> & {
          owner: { kind: 'proposal'; id: string };
        },
      ) => Promise<void>;
    };
    const proposalInput = {
      ...input,
      owner: { kind: 'proposal' as const, id: 'proposal-1' },
    };

    await config.onSettled(undefined, null, proposalInput);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['board-feedback', 'proposal-1'],
    });
  });
});

describe('owner-aware board hooks', () => {
  it('keeps legacy proposal query keys while scoping project owners to project_id', async () => {
    const builder = pushTableResult('proposal_boards', { data: [], error: null });
    const project = useBoards({ kind: 'project', id: 'project-1' }) as unknown as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown[]>;
    };
    expect(project.queryKey).toEqual(['project-owned-boards', 'project-1']);
    await project.queryFn();
    expect(builder.__chain.filter((call) => call.method === 'eq').map((call) => call.args))
      .toContainEqual(['project_id', 'project-1']);

    const legacy = useBoards('proposal-1') as unknown as { queryKey: readonly unknown[] };
    expect(legacy.queryKey).toEqual(['boards', 'proposal-1']);
  });

  it('inserts a caller-supplied id and complete snapshot for delete resurrection', async () => {
    const inserted = {
      id: 'item-original',
      board_id: 'board-1',
      type: 'product',
      x: 12,
      y: 34,
    };
    const builder = pushTableResult('proposal_board_items', { data: inserted, error: null });
    const config = useAddBoardItem() as unknown as {
      mutationFn: (input: Record<string, unknown>) => Promise<unknown>;
    };
    await config.mutationFn({
      itemId: 'item-original',
      boardId: 'board-1',
      owner: { kind: 'project', id: 'project-1' },
      type: 'product',
      x: 12,
      y: 34,
      width: 210,
      height: null,
      productId: 'product-1',
      imageUrl: 'https://cdn.example/chair.jpg',
      data: { source_url: 'https://maker.example/chair' },
    });

    const insert = builder.__chain.find((call) => call.method === 'insert');
    expect(insert?.args[0]).toEqual(expect.objectContaining({
      id: 'item-original',
      board_id: 'board-1',
      product_id: 'product-1',
      image_url: 'https://cdn.example/chair.jpg',
      data: { source_url: 'https://maker.example/chair' },
    }));
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

  // 00264: archived boards must never reach the shared render surfaces. The
  // single choke point is this hook's status='active' filter.
  it('filters to active boards so archived ones never reach the client copy', async () => {
    const builder = pushTableResult('proposal_boards', { data: [], error: null });
    const config = useBoardsWithItems('prop-1') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await config.queryFn();

    const eqCalls = builder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqCalls).toContainEqual(['proposal_id', 'prop-1']);
    expect(eqCalls).toContainEqual(['status', 'active']);
  });
});

describe('useDuplicateBoard atomic RPC', () => {
  it('delegates the complete board + item copy to one RPC', async () => {
    rpc.mockResolvedValueOnce({
      data: { id: 'copy-1', proposal_id: 'prop-1', name: 'Living room (Copy)' },
      error: null,
    });
    const variables = { proposalId: 'prop-1', boardId: 'source-board' };
    const config = useDuplicateBoard() as unknown as {
      mutationFn: (input: typeof variables) => Promise<{ id: string }>;
    };

    await expect(config.mutationFn(variables)).resolves.toEqual(
      expect.objectContaining({ id: 'copy-1' }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('duplicate_proposal_board', {
      p_proposal_id: 'prop-1',
      p_board_id: 'source-board',
    });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('surfaces a forced former second-leg failure without issuing a browser-side insert', async () => {
    const rpcError = new Error('forced copied-item insert failure; transaction rolled back');
    rpc.mockResolvedValueOnce({ data: null, error: rpcError });
    const variables = { proposalId: 'prop-1', boardId: 'source-board' };
    const config = useDuplicateBoard() as unknown as {
      mutationFn: (input: typeof variables) => Promise<unknown>;
      onSettled: (
        data: unknown,
        error: unknown,
        input: typeof variables,
      ) => Promise<void>;
    };

    const failure = await config.mutationFn(variables).then(
      () => null,
      (error) => error,
    );

    expect(failure).toBe(rpcError);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fromSpy).not.toHaveBeenCalled();

    await config.onSettled(undefined, failure, variables);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['boards', 'prop-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['boards-with-items', 'prop-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['drafting-facets', 'prop-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposal-mirror', 'prop-1'],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeBoard — count + fallback cover derivation, defensive defaults.
// ─────────────────────────────────────────────────────────────────────────────

describe('summarizeBoard', () => {
  it('counts items and returns the first four pin images in z-order for the fallback mosaic', () => {
    const summary = summarizeBoard(
      { id: 'b1', name: 'Whole Home', proposal_id: 'p1', cover_image_url: null },
      [
        { type: 'product', image_url: 'product.jpg', z_index: 0 },
        { type: 'image', image_url: 'top.jpg', z_index: 5 },
        {
          type: 'image',
          image_url: 'bottom.jpg',
          data: { thumbnail_url: 'bottom-thumb.jpg' },
          z_index: 1,
        },
        { type: 'capture', image_url: 'material.jpg', z_index: 3 },
        { type: 'product', image_url: 'fifth.jpg', z_index: 9 },
      ],
    );
    expect(summary.item_count).toBe(5);
    expect(summary.cover_fallback_url).toBe('product.jpg');
    expect(summary.cover_fallback_urls).toEqual([
      'product.jpg',
      'bottom-thumb.jpg',
      'material.jpg',
      'top.jpg',
    ]);
  });

  it('defaults sections/status for pre-00264 rows and null cover with no images', () => {
    const summary = summarizeBoard({ id: 'b1', name: 'B', proposal_id: 'p1' }, [
      { type: 'note', image_url: null, z_index: 0 },
    ]);
    expect(summary.sections).toEqual([]);
    expect(summary.status).toBe('active');
    expect(summary.cover_fallback_url).toBeNull();
    expect(summary.cover_fallback_urls).toEqual([]);
    expect(summary.verdict_counts).toEqual({ approved: 0, rejected: 0, comment: 0, total: 0 });
  });

  it('uses the active cutout for fallback covers while original_image_url marks it as applied', () => {
    const summary = summarizeBoard(
      { id: 'b1', name: 'Cutout', proposal_id: 'p1', cover_image_url: null },
      [{
        type: 'image',
        image_url: 'chair-cutout.png',
        data: {
          original_image_url: 'chair.jpg',
          thumbnail_url: 'chair-thumb.jpg',
        },
        z_index: 0,
      }],
    );

    expect(summary.cover_fallback_urls).toEqual(['chair-cutout.png']);
  });

  it('folds RLS-visible current verdicts into the cover summary', () => {
    const summary = summarizeBoard({ id: 'b1', name: 'B', proposal_id: 'p1' }, [
      {
        type: 'product',
        image_url: null,
        z_index: 0,
        verdicts: [
          {
            id: 'f1',
            client_id: 'client-1',
            verdict: 'rejected',
            created_at: '2026-08-01T10:00:00Z',
          },
          {
            id: 'f2',
            client_id: 'client-1',
            verdict: 'approved',
            created_at: '2026-08-02T10:00:00Z',
          },
        ],
      },
    ]);

    expect(summary.verdict_counts).toEqual({ approved: 1, rejected: 0, comment: 0, total: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpsertBoard — the B8 owner switch (00272). EXACTLY ONE of proposal_id /
// project_id is written on the INSERT path; the UPDATE path keys on boardId and
// never touches the owner.
// ─────────────────────────────────────────────────────────────────────────────

describe('useUpsertBoard — owner switch (B8)', () => {
  const mutationFnOf = () =>
    (useUpsertBoard() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    }).mutationFn;

  it('inserts a PROJECT-owned board with project_id and NO proposal_id', async () => {
    const builder = pushTableResult('proposal_boards', {
      data: { id: 'b1', project_id: 'proj-1', proposal_id: null },
      error: null,
    });
    await mutationFnOf()({ projectId: 'proj-1', name: 'Working board' });
    const row = builder.__chain.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(row.project_id).toBe('proj-1');
    expect(row).not.toHaveProperty('proposal_id');
  });

  it('inserts a PROPOSAL-owned board with proposal_id and NO project_id', async () => {
    const builder = pushTableResult('proposal_boards', {
      data: { id: 'b1', proposal_id: 'prop-1' },
      error: null,
    });
    await mutationFnOf()({ proposalId: 'prop-1', name: 'Concept' });
    const row = builder.__chain.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(row.proposal_id).toBe('prop-1');
    expect(row).not.toHaveProperty('project_id');
  });

  it('throws on insert when neither owner is provided', async () => {
    await expect(mutationFnOf()({ name: 'Orphan' })).rejects.toThrow(/owner/i);
  });

  it('the UPDATE path keys on boardId and never writes an owner column', async () => {
    const builder = pushTableResult('proposal_boards', { data: { id: 'b1' }, error: null });
    await mutationFnOf()({ boardId: 'b1', name: 'Renamed' });
    const row = builder.__chain.find((c) => c.method === 'update')?.args[0] as Record<string, unknown>;
    expect(row.name).toBe('Renamed');
    expect(row).not.toHaveProperty('proposal_id');
    expect(row).not.toHaveProperty('project_id');
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'b1']);
  });
});

// useProjectOwnedBoards — the live project-owned list (00272), keyed on project_id.
describe('useProjectOwnedBoards', () => {
  it('is disabled without a project id', () => {
    const config = useProjectOwnedBoards(null) as unknown as { enabled: boolean };
    expect(config.enabled).toBe(false);
  });

  it('selects proposal_boards scoped to project_id with a compact item projection', async () => {
    const builder = pushTableResult('proposal_boards', {
      data: [
        {
          id: 'b1',
          project_id: 'proj-1',
          proposal_id: null,
          name: 'Working board',
          canvas_width: 1200,
          canvas_height: 800,
          background_color: '#FAF8F5',
          sort_order: 0,
          proposal_board_items: [{ type: 'image', image_url: 'x.jpg', z_index: 0 }],
        },
      ],
      error: null,
    });
    const config = useProjectOwnedBoards('proj-1') as unknown as {
      queryFn: () => Promise<Array<{ project_id: string | null; item_count: number }>>;
    };
    const result = await config.queryFn();
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['project_id', 'proj-1']);
    expect(builder.__chain.find((c) => c.method === 'select')?.args[0]).toContain(
      'verdicts:item_feedback!item_feedback_board_item_id_fkey',
    );
    expect(result[0].project_id).toBe('proj-1');
    expect(result[0].item_count).toBe(1);
  });
});
