import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// R88 Wave 2 — field-grain search filter contract.
//
// The Library's field search extends the cross-layer keyword search from
// name+brand to name · maker(brand) · SKU · category. We prove two things:
//   1. `buildCrossLayerOrFilter` (pure) emits the right `.or()` clauses.
//   2. The hook's queryFn actually passes that filter to `.or()` and groups the
//      RLS-filtered rows by layer.
//
// The hook chains a Supabase builder and is wrapped in React Query; we intercept
// `useQuery` at the module boundary (returns its config verbatim, exposing
// `queryFn`) and record the builder chain — mirroring use-nurture-reviews-filter.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  or: any;
  order: any;
  limit: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  __chain: Array<{ method: string; args: unknown[] }>;
  __result: BuilderResult;
}

function makeBuilder(result: BuilderResult = { data: [], error: null }): MockBuilder {
  const builder = {
    __chain: [] as Array<{ method: string; args: unknown[] }>,
    __result: result,
  } as MockBuilder;

  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      builder.__chain.push({ method, args });
      return builder;
    });

  builder.select = record('select');
  builder.or = record('or');
  builder.order = record('order');
  builder.limit = record('limit');
  // The chain terminates on `.limit(...)` and is awaited — resolve the result.
  builder.then = (resolve) => Promise.resolve(builder.__result).then(resolve);

  return builder;
}

let productsBuilder: MockBuilder = makeBuilder();

const supabaseClient = {
  from: vi.fn(() => productsBuilder),
};

// Mock at the leaf: src/client.ts wraps @supabase/ssr's createBrowserClient
// (mirrors use-nurture-reviews-filter.test.ts, which avoids needing real env).
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

// Import AFTER the mocks are wired up.
import {
  useCrossLayerSearch,
  buildCrossLayerOrFilter,
  DEFAULT_CROSS_LAYER_FIELDS,
  type UseCrossLayerSearchOptions,
} from '../use-cross-layer-search';

function queryFnFor(options: UseCrossLayerSearchOptions) {
  return (useCrossLayerSearch(options) as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function orCalls(b: MockBuilder) {
  return b.__chain.filter((c) => c.method === 'or');
}

beforeEach(() => {
  productsBuilder = makeBuilder();
});

// ─────────────────────────────────────────────────────────────────────────────
// buildCrossLayerOrFilter — the pure field set
// ─────────────────────────────────────────────────────────────────────────────

describe('buildCrossLayerOrFilter', () => {
  it('defaults to name · maker(brand) · SKU · category', () => {
    expect(DEFAULT_CROSS_LAYER_FIELDS).toEqual(['name', 'brand', 'sku', 'category']);
    expect(buildCrossLayerOrFilter('%oak%')).toBe(
      'name.ilike.%oak%,brand.ilike.%oak%,sku.ilike.%oak%,category.ilike.%oak%',
    );
  });

  it('emits one ilike clause per requested field, in order', () => {
    expect(buildCrossLayerOrFilter('%x%', ['sku'])).toBe('sku.ilike.%x%');
    expect(buildCrossLayerOrFilter('%x%', ['category', 'name'])).toBe(
      'category.ilike.%x%,name.ilike.%x%',
    );
  });

  it('falls back to the default set when given an empty field list', () => {
    expect(buildCrossLayerOrFilter('%x%', [])).toBe(
      'name.ilike.%x%,brand.ilike.%x%,sku.ilike.%x%,category.ilike.%x%',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useCrossLayerSearch queryFn — passes the filter + groups by layer
// ─────────────────────────────────────────────────────────────────────────────

describe('useCrossLayerSearch — extended filter + grouping', () => {
  it('filters on name, maker(brand), SKU, and category by default', async () => {
    await queryFnFor({ query: 'oak' })();

    const calls = orCalls(productsBuilder);
    expect(calls).toHaveLength(1);
    const filter = calls[0].args[0] as string;
    expect(filter).toContain('name.ilike.%oak%');
    expect(filter).toContain('brand.ilike.%oak%'); // maker
    expect(filter).toContain('sku.ilike.%oak%');
    expect(filter).toContain('category.ilike.%oak%');
  });

  it('honours an explicit narrower field set (SKU only)', async () => {
    await queryFnFor({ query: 'LS-9', fields: ['sku'] })();

    const filter = orCalls(productsBuilder)[0].args[0] as string;
    expect(filter).toBe('sku.ilike.%LS-9%');
  });

  it('groups RLS-filtered rows by layer with per-layer counts', async () => {
    productsBuilder = makeBuilder({
      data: [
        { id: '1', name: 'Oak A', layer: 'personal' },
        { id: '2', name: 'Oak B', layer: 'catalog' },
        { id: '3', name: 'Oak C', layer: 'personal' },
      ],
      error: null,
    });

    const result = (await queryFnFor({ query: 'oak' })()) as {
      byLayer: Record<string, unknown[]>;
      counts: Record<string, number>;
      total: number;
    };

    expect(result.counts).toEqual({ personal: 2, studio: 0, catalog: 1 });
    expect(result.total).toBe(3);
    expect(result.byLayer.personal).toHaveLength(2);
  });
});
