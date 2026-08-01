import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (mirrors use-leads.test.ts)
// ─────────────────────────────────────────────────────────────────────────────
//
// These hooks chain a Supabase query builder and are wrapped in React Query.
// We can't render them (no jsdom), so we intercept React Query at the module
// boundary: `useQuery` returns its config verbatim, exposing `queryFn` for
// direct invocation. The mock builder records every chain call in `__chain`,
// letting us assert WHICH `.eq()` / `.in()` calls fired for a given filter.
//
// This proves the P2 change: the `designer_client_id` filter is added to the
// query iff `filters.designerClientId` is set — and is otherwise absent.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  eq: any;
  in: any;
  order: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  // Every chain call across the table's lifetime, in order.
  __chain: Array<{ method: string; args: unknown[] }>;
  // The terminal result resolved when the chain is awaited.
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
  builder.eq = record('eq');
  builder.in = record('in');
  builder.order = record('order');

  // Awaiting the chain (these list queries end on `.order(...)`/`.eq(...)`) is
  // the terminal op — it resolves the fixed result.
  builder.then = (resolve) => Promise.resolve(builder.__result).then(resolve);

  return builder;
}

const builders: Record<string, MockBuilder> = {};

function setTable(table: string, result: BuilderResult = { data: [], error: null }): MockBuilder {
  const b = makeBuilder(result);
  builders[table] = b;
  return b;
}

const supabaseClient = {
  auth: { getUser: vi.fn() },
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
import { useNurtureTouchpoints, type NurtureFilters } from '../use-nurture';
import {
  useClientReviews,
  useCreateReviewRequest,
  type ReviewFilters,
} from '../use-reviews';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockClear();
});

function nurtureQueryFn(filters?: NurtureFilters) {
  return (useNurtureTouchpoints(filters) as unknown as {
    queryFn: () => Promise<unknown>;
  }).queryFn;
}

function reviewsQueryFn(filters?: ReviewFilters) {
  return (useClientReviews(filters) as unknown as {
    queryFn: () => Promise<unknown>;
  }).queryFn;
}

function designerClientEqCalls(b: MockBuilder) {
  return b.__chain.filter((c) => c.method === 'eq' && c.args[0] === 'designer_client_id');
}

// ─────────────────────────────────────────────────────────────────────────────
// useNurtureTouchpoints
// ─────────────────────────────────────────────────────────────────────────────

describe('useNurtureTouchpoints — server-side designerClientId filter (P2)', () => {
  it("adds .eq('designer_client_id', id) when designerClientId is set", async () => {
    const b = setTable('client_nurture_touchpoints');
    await nurtureQueryFn({ designerClientId: 'dc-123' })();

    const calls = designerClientEqCalls(b);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['designer_client_id', 'dc-123']);
  });

  it('does NOT filter on designer_client_id when no filters are passed (over-fetch path for all-clients views)', async () => {
    const b = setTable('client_nurture_touchpoints');
    await nurtureQueryFn()();

    expect(designerClientEqCalls(b)).toHaveLength(0);
  });

  it('does NOT filter on designer_client_id when only status/type filters are passed', async () => {
    const b = setTable('client_nurture_touchpoints');
    await nurtureQueryFn({ status: 'suggested', type: 'check_in' })();

    expect(designerClientEqCalls(b)).toHaveLength(0);
    // The unrelated filters still fire.
    expect(b.__chain.some((c) => c.method === 'eq' && c.args[0] === 'status')).toBe(true);
    expect(b.__chain.some((c) => c.method === 'eq' && c.args[0] === 'touchpoint_type')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useClientReviews
// ─────────────────────────────────────────────────────────────────────────────

describe('useClientReviews — server-side designerClientId filter (P2)', () => {
  it("adds .eq('designer_client_id', id) when designerClientId is set", async () => {
    const b = setTable('client_reviews');
    await reviewsQueryFn({ designerClientId: 'dc-456' })();

    const calls = designerClientEqCalls(b);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['designer_client_id', 'dc-456']);
  });

  it('does NOT filter on designer_client_id when no filters are passed (over-fetch path for all-clients views)', async () => {
    const b = setTable('client_reviews');
    await reviewsQueryFn()();

    expect(designerClientEqCalls(b)).toHaveLength(0);
  });

  it('does NOT filter on designer_client_id when only requestStatus is passed', async () => {
    const b = setTable('client_reviews');
    await reviewsQueryFn({ requestStatus: 'sent' })();

    expect(designerClientEqCalls(b)).toHaveLength(0);
    expect(b.__chain.some((c) => c.method === 'eq' && c.args[0] === 'request_status')).toBe(true);
  });
});

describe('useCreateReviewRequest — post-close candidate refresh', () => {
  it('removes the completed project from the request-ready list after creation', () => {
    const mutation = useCreateReviewRequest() as unknown as {
      onSuccess: () => void;
    };

    mutation.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['client-reviews'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['review-stats'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['completed-projects-without-review'],
    });
  });
});
