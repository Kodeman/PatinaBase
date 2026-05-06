import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textSearch: any;
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
  builder.eq = record('eq');
  builder.order = record('order');
  builder.limit = record('limit');
  builder.textSearch = record('textSearch');

  builder.maybeSingle = vi.fn(() => {
    builder.__chain.push({ method: 'maybeSingle', args: [] });
    return Promise.resolve(builder.__result);
  });

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
  from: vi.fn((table: string) => {
    if (!builders[table]) builders[table] = makeBuilder();
    return builders[table];
  }),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

// Import AFTER the mocks are wired up.
import { useSearchPaintColors, usePaintColor } from '../use-paint-colors';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
});

// ─────────────────────────────────────────────────────────────────────────────
// useSearchPaintColors
// ─────────────────────────────────────────────────────────────────────────────

describe('useSearchPaintColors', () => {
  it('is disabled when neither query nor brand is provided', () => {
    const config = useSearchPaintColors('') as unknown as { enabled: boolean };
    expect(config.enabled).toBe(false);
  });

  it('is enabled when brand is provided even without a query', () => {
    const config = useSearchPaintColors('', 'sherwin_williams') as unknown as { enabled: boolean };
    expect(config.enabled).toBe(true);
  });

  it('uses textSearch on search_vector when a query is provided', async () => {
    const builder = setTableResult('paint_colors', { data: [], error: null });
    const config = useSearchPaintColors('alabaster') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await config.queryFn();

    const ts = builder.__chain.find((c) => c.method === 'textSearch');
    expect(ts).toBeTruthy();
    expect(ts?.args[0]).toBe('search_vector');
    expect(ts?.args[1]).toBe('alabaster');
  });

  it('filters by brand when provided', async () => {
    const builder = setTableResult('paint_colors', { data: [], error: null });
    const config = useSearchPaintColors('white', 'benjamin_moore') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await config.queryFn();

    const eq = builder.__chain.find((c) => c.method === 'eq');
    expect(eq?.args).toEqual(['brand', 'benjamin_moore']);
  });

  it('orders by code when only brand is given (no query)', async () => {
    const builder = setTableResult('paint_colors', { data: [], error: null });
    const config = useSearchPaintColors('', 'farrow_ball') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await config.queryFn();

    const order = builder.__chain.find((c) => c.method === 'order');
    expect(order?.args[0]).toBe('code');
  });

  it('throws when supabase returns an error', async () => {
    setTableResult('paint_colors', { data: null, error: new Error('fts fail') });
    const config = useSearchPaintColors('white') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await expect(config.queryFn()).rejects.toThrow('fts fail');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// usePaintColor
// ─────────────────────────────────────────────────────────────────────────────

describe('usePaintColor', () => {
  it('is disabled when id is missing', () => {
    const config = usePaintColor(null) as unknown as { enabled: boolean };
    expect(config.enabled).toBe(false);
  });

  it('queries by id and returns the row', async () => {
    setTableResult('paint_colors', {
      data: { id: 'pc-1', brand: 'sherwin_williams', code: 'SW7008', name: 'Alabaster', hex: '#EDEAE0' },
      error: null,
    });
    const config = usePaintColor('pc-1') as unknown as {
      queryFn: () => Promise<unknown>;
    };
    const result = await config.queryFn();
    expect(result).toMatchObject({ name: 'Alabaster' });
  });

  it('returns null when not found', async () => {
    setTableResult('paint_colors', { data: null, error: null });
    const config = usePaintColor('missing') as unknown as {
      queryFn: () => Promise<unknown>;
    };
    expect(await config.queryFn()).toBeNull();
  });
});
