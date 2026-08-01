import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (mirrors use-ffe-categories.test.ts)
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
  delete: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  neq: any;
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
  builder.delete = record('delete');
  builder.eq = record('eq');
  builder.neq = record('neq');
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

// Each table can have a list of builders so we can return different
// results for sequential calls (e.g. the demote-then-update flow).
const builderQueues: Record<string, MockBuilder[]> = {};

function pushTableResult(table: string, result: BuilderResult): MockBuilder {
  const b = makeBuilder(result);
  if (!builderQueues[table]) builderQueues[table] = [];
  builderQueues[table].push(b);
  return b;
}

const rpc = vi.fn();
const supabaseClient = {
  rpc,
  from: vi.fn((table: string) => {
    const queue = builderQueues[table];
    if (queue && queue.length > 1) return queue.shift()!;
    if (queue && queue.length === 1) return queue[0];
    const b = makeBuilder();
    builderQueues[table] = [b];
    return b;
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
import {
  usePalettes,
  usePalette,
  useUpsertPalette,
  useDeletePalette,
  useUpsertSwatch,
  useDeleteSwatch,
  useReorderSwatches,
} from '../use-palettes';

beforeEach(() => {
  Object.keys(builderQueues).forEach((k) => delete builderQueues[k]);
  invalidateQueries.mockReset();
  rpc.mockReset();
  supabaseClient.from.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
// usePalettes
// ─────────────────────────────────────────────────────────────────────────────

describe('usePalettes', () => {
  it('queries palettes for the proposal id', async () => {
    const builder = pushTableResult('proposal_palettes', {
      data: [{ id: 'p1', proposal_id: 'prop-1', name: 'Whole Home', is_primary: true }],
      error: null,
    });

    const config = usePalettes('prop-1') as unknown as {
      queryFn: () => Promise<unknown[]>;
      enabled: boolean;
    };
    const result = await config.queryFn();

    expect(result).toHaveLength(1);
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['proposal_id', 'prop-1']);
  });

  it('is disabled when proposal id is missing', () => {
    const config = usePalettes(null) as unknown as { enabled: boolean };
    expect(config.enabled).toBe(false);
  });

  it('throws when supabase returns an error', async () => {
    pushTableResult('proposal_palettes', { data: null, error: new Error('boom') });
    const config = usePalettes('prop-1') as unknown as { queryFn: () => Promise<unknown[]> };
    await expect(config.queryFn()).rejects.toThrow('boom');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// usePalette
// ─────────────────────────────────────────────────────────────────────────────

describe('usePalette', () => {
  it('joins swatches into the palette payload', async () => {
    pushTableResult('proposal_palettes', {
      data: { id: 'pal-1', name: 'Whole Home', proposal_id: 'prop-1' },
      error: null,
    });
    pushTableResult('palette_swatches', {
      data: [{ id: 's1', palette_id: 'pal-1', hex: '#ABCDEF' }],
      error: null,
    });

    const config = usePalette('pal-1') as unknown as {
      queryFn: () => Promise<{ swatches: unknown[] } | null>;
    };
    const result = await config.queryFn();
    expect(result).toBeTruthy();
    expect(result?.swatches).toHaveLength(1);
  });

  it('returns null when palette does not exist', async () => {
    pushTableResult('proposal_palettes', { data: null, error: null });
    const config = usePalette('missing') as unknown as { queryFn: () => Promise<unknown> };
    const result = await config.queryFn();
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpsertPalette
// ─────────────────────────────────────────────────────────────────────────────

describe('useUpsertPalette', () => {
  it('inserts a new palette when no paletteId is provided', async () => {
    const insertBuilder = pushTableResult('proposal_palettes', {
      data: { id: 'new', proposal_id: 'prop-1', name: 'Test', is_primary: false },
      error: null,
    });

    const config = useUpsertPalette() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await config.mutationFn({ proposalId: 'prop-1', name: 'Test' });

    expect(insertBuilder.__chain.find((c) => c.method === 'insert')).toBeTruthy();
    expect(insertBuilder.__chain.find((c) => c.method === 'insert')?.args[0]).toEqual(
      expect.objectContaining({
        proposal_id: 'prop-1',
        name: 'Test',
        is_primary: false,
      })
    );
  });

  it('demotes existing primary palette before promoting a new one', async () => {
    const demoteBuilder = pushTableResult('proposal_palettes', { data: null, error: null });
    const insertBuilder = pushTableResult('proposal_palettes', {
      data: { id: 'new', proposal_id: 'prop-1', name: 'Primary', is_primary: true },
      error: null,
    });

    const config = useUpsertPalette() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await config.mutationFn({ proposalId: 'prop-1', name: 'Primary', isPrimary: true });

    // First builder used demote (update).
    expect(demoteBuilder.__chain.find((c) => c.method === 'update')).toBeTruthy();
    // Second builder used insert.
    expect(insertBuilder.__chain.find((c) => c.method === 'insert')).toBeTruthy();
  });

  it('updates rather than inserts when paletteId is provided', async () => {
    const updateBuilder = pushTableResult('proposal_palettes', {
      data: { id: 'pal-1', proposal_id: 'prop-1', name: 'Renamed' },
      error: null,
    });

    const config = useUpsertPalette() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await config.mutationFn({ proposalId: 'prop-1', paletteId: 'pal-1', name: 'Renamed' });

    expect(updateBuilder.__chain.find((c) => c.method === 'update')).toBeTruthy();
    expect(updateBuilder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'pal-1']);
  });

  it('throws when inserting without a name', async () => {
    pushTableResult('proposal_palettes', { data: null, error: null });
    const config = useUpsertPalette() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await expect(config.mutationFn({ proposalId: 'prop-1' })).rejects.toThrow(/name is required/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useDeletePalette
// ─────────────────────────────────────────────────────────────────────────────

describe('useDeletePalette', () => {
  it('issues delete by id', async () => {
    const builder = pushTableResult('proposal_palettes', { data: null, error: null });
    const config = useDeletePalette() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await config.mutationFn({ paletteId: 'pal-1', proposalId: 'prop-1' });

    expect(builder.__chain.find((c) => c.method === 'delete')).toBeTruthy();
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'pal-1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpsertSwatch
// ─────────────────────────────────────────────────────────────────────────────

describe('useUpsertSwatch', () => {
  it('inserts a new swatch row', async () => {
    const builder = pushTableResult('palette_swatches', {
      data: { id: 'sw-1', palette_id: 'pal-1', hex: '#ABCDEF' },
      error: null,
    });

    const config = useUpsertSwatch() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await config.mutationFn({
      paletteId: 'pal-1',
      hex: '#ABCDEF',
      role: 'wall',
      sourcePixel: { x: 10, y: 20 },
    });

    const insert = builder.__chain.find((c) => c.method === 'insert');
    expect(insert).toBeTruthy();
    expect(insert?.args[0]).toEqual(
      expect.objectContaining({
        palette_id: 'pal-1',
        hex: '#ABCDEF',
        role: 'wall',
        source_pixel: { x: 10, y: 20 },
      })
    );
  });

  it('updates when swatchId is provided', async () => {
    const builder = pushTableResult('palette_swatches', {
      data: { id: 'sw-1', palette_id: 'pal-1', hex: '#FFFFFF' },
      error: null,
    });

    const config = useUpsertSwatch() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await config.mutationFn({
      paletteId: 'pal-1',
      swatchId: 'sw-1',
      hex: '#FFFFFF',
    });

    expect(builder.__chain.find((c) => c.method === 'update')).toBeTruthy();
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'sw-1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useDeleteSwatch
// ─────────────────────────────────────────────────────────────────────────────

describe('useDeleteSwatch', () => {
  it('issues delete by swatch id', async () => {
    const builder = pushTableResult('palette_swatches', { data: null, error: null });
    const config = useDeleteSwatch() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await config.mutationFn({ swatchId: 'sw-1', paletteId: 'pal-1' });

    expect(builder.__chain.find((c) => c.method === 'delete')).toBeTruthy();
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'sw-1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useReorderSwatches
// ─────────────────────────────────────────────────────────────────────────────

describe('useReorderSwatches', () => {
  it('sends the exact swatch order to one atomic RPC', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const config = useReorderSwatches() as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutationFn: (input: any) => Promise<any>;
    };
    await config.mutationFn({
      paletteId: 'pal-1',
      proposalId: 'prop-1',
      orderedIds: ['a', 'b', 'c'],
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('reorder_palette_swatches', {
      p_proposal_id: 'prop-1',
      p_palette_id: 'pal-1',
      p_ordered_ids: ['a', 'b', 'c'],
    });
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('surfaces a forced former kth-row failure without issuing sequential updates', async () => {
    const rpcError = new Error('forced kth-row update failure; transaction rolled back');
    rpc.mockResolvedValueOnce({ data: null, error: rpcError });
    const variables = {
      paletteId: 'pal-1',
      proposalId: 'prop-1',
      orderedIds: ['a', 'b', 'c'],
    };
    const config = useReorderSwatches() as unknown as {
      mutationFn: (input: typeof variables) => Promise<void>;
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
    expect(supabaseClient.from).not.toHaveBeenCalled();

    await config.onSettled(undefined, failure, variables);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposal-palette', 'pal-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposal-palettes'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['drafting-facets', 'prop-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposal-mirror', 'prop-1'],
    });
  });
});
