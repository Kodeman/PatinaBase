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
  order: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  single: any;
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
  builder.order = record('order');

  builder.single = vi.fn(() => {
    builder.__chain.push({ method: 'single', args: [] });
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

const rpcMock = vi.fn();

const supabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn((table: string) => {
    if (!builders[table]) builders[table] = makeBuilder();
    return builders[table];
  }),
  rpc: rpcMock,
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
  useProposalCaptures,
  useAssignCapture,
  useConsumeCapture,
  useDismissCapture,
  useCommitProposalCapture,
} from '../use-proposal-captures';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockReset();
  supabaseClient.auth.getUser.mockReset();
  rpcMock.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// useProposalCaptures
// ─────────────────────────────────────────────────────────────────────────────

describe('useProposalCaptures', () => {
  it('queries with status=inbox by default and orders by captured_at desc', async () => {
    const builder = setTableResult('proposal_captures', {
      data: [
        { id: 'c1', status: 'inbox', designer_id: 'd1', source_url: 'http://x', raw_payload: {} },
      ],
      error: null,
    });

    const config = useProposalCaptures() as unknown as { queryFn: () => Promise<unknown[]> };
    const result = await config.queryFn();

    expect(result).toHaveLength(1);
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['status', 'inbox']);
    expect(builder.__chain.find((c) => c.method === 'order')?.args[0]).toBe('captured_at');
  });

  it('skips the status filter when status="all"', async () => {
    const builder = setTableResult('proposal_captures', { data: [], error: null });
    const config = useProposalCaptures({ status: 'all' }) as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await config.queryFn();
    const eqStatusCall = builder.__chain.find(
      (c) => c.method === 'eq' && c.args[0] === 'status'
    );
    expect(eqStatusCall).toBeUndefined();
  });

  it('filters by proposal_id when proposalId is provided', async () => {
    const builder = setTableResult('proposal_captures', { data: [], error: null });
    const config = useProposalCaptures({ proposalId: 'p1' }) as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await config.queryFn();
    const proposalEq = builder.__chain.find(
      (c) => c.method === 'eq' && c.args[0] === 'proposal_id'
    );
    expect(proposalEq?.args).toEqual(['proposal_id', 'p1']);
  });

  it('throws when supabase returns an error', async () => {
    setTableResult('proposal_captures', { data: null, error: new Error('rls denied') });
    const config = useProposalCaptures() as unknown as { queryFn: () => Promise<unknown[]> };
    await expect(config.queryFn()).rejects.toThrow('rls denied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useAssignCapture
// ─────────────────────────────────────────────────────────────────────────────

describe('useAssignCapture', () => {
  it('stays in inbox status when only proposalId is set', async () => {
    const builder = setTableResult('proposal_captures', { data: null, error: null });
    const config = useAssignCapture() as unknown as {
      mutationFn: (input: {
        captureId: string;
        proposalId: string;
        scopeRoomId?: string;
        ffeCategorySlug?: string;
      }) => Promise<unknown>;
    };

    await config.mutationFn({ captureId: 'c1', proposalId: 'p1' });

    const updateCall = builder.__chain.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({
      proposal_id: 'p1',
      scope_room_id: null,
      ffe_category_slug: null,
      status: 'inbox',
    });
  });

  it('transitions to assigned when proposal/room/category are all set', async () => {
    const builder = setTableResult('proposal_captures', { data: null, error: null });
    const config = useAssignCapture() as unknown as {
      mutationFn: (input: {
        captureId: string;
        proposalId: string;
        scopeRoomId?: string;
        ffeCategorySlug?: string;
      }) => Promise<unknown>;
    };

    await config.mutationFn({
      captureId: 'c1',
      proposalId: 'p1',
      scopeRoomId: 'r1',
      ffeCategorySlug: 'seating',
    });

    const updateCall = builder.__chain.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({
      proposal_id: 'p1',
      scope_room_id: 'r1',
      ffe_category_slug: 'seating',
      status: 'assigned',
    });
  });

  it('throws when supabase returns an error', async () => {
    setTableResult('proposal_captures', { data: null, error: new Error('rls denied') });
    const config = useAssignCapture() as unknown as {
      mutationFn: (input: { captureId: string; proposalId: string }) => Promise<unknown>;
    };
    await expect(config.mutationFn({ captureId: 'c', proposalId: 'p' })).rejects.toThrow(
      'rls denied'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useConsumeCapture
// ─────────────────────────────────────────────────────────────────────────────

describe('useConsumeCapture', () => {
  it('calls the consume_capture RPC with mapped argument names', async () => {
    rpcMock.mockResolvedValue({ data: 'item-uuid-1', error: null });

    const config = useConsumeCapture() as unknown as {
      mutationFn: (input: {
        captureId: string;
        proposalId: string;
        scopeRoomId: string;
        ffeCategorySlug: string;
        qty?: number;
      }) => Promise<{ proposalItemId: string }>;
    };

    const result = await config.mutationFn({
      captureId: 'c1',
      proposalId: 'p1',
      scopeRoomId: 'r1',
      ffeCategorySlug: 'seating',
      qty: 3,
    });

    expect(result).toEqual({ proposalItemId: 'item-uuid-1' });
    expect(rpcMock).toHaveBeenCalledWith('consume_capture', {
      p_capture_id: 'c1',
      p_proposal_id: 'p1',
      p_scope_room_id: 'r1',
      p_ffe_category_slug: 'seating',
      p_qty: 3,
    });
  });

  it('defaults qty to 1 when omitted', async () => {
    rpcMock.mockResolvedValue({ data: 'item-uuid-2', error: null });

    const config = useConsumeCapture() as unknown as {
      mutationFn: (input: {
        captureId: string;
        proposalId: string;
        scopeRoomId: string;
        ffeCategorySlug: string;
      }) => Promise<{ proposalItemId: string }>;
    };

    await config.mutationFn({
      captureId: 'c1',
      proposalId: 'p1',
      scopeRoomId: 'r1',
      ffeCategorySlug: 'lighting',
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'consume_capture',
      expect.objectContaining({ p_qty: 1 })
    );
  });

  it('rethrows RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('capture already consumed or dismissed') });

    const config = useConsumeCapture() as unknown as {
      mutationFn: (input: {
        captureId: string;
        proposalId: string;
        scopeRoomId: string;
        ffeCategorySlug: string;
      }) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({
        captureId: 'c1',
        proposalId: 'p1',
        scopeRoomId: 'r1',
        ffeCategorySlug: 'seating',
      })
    ).rejects.toThrow('capture already consumed or dismissed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useDismissCapture
// ─────────────────────────────────────────────────────────────────────────────

describe('useDismissCapture', () => {
  it('updates the row to status=dismissed', async () => {
    const builder = setTableResult('proposal_captures', { data: null, error: null });
    const config = useDismissCapture() as unknown as {
      mutationFn: (input: { captureId: string }) => Promise<unknown>;
    };

    await config.mutationFn({ captureId: 'c1' });

    const updateCall = builder.__chain.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ status: 'dismissed' });
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'c1']);
  });

  it('throws when supabase returns an error', async () => {
    setTableResult('proposal_captures', { data: null, error: new Error('boom') });
    const config = useDismissCapture() as unknown as {
      mutationFn: (input: { captureId: string }) => Promise<unknown>;
    };
    await expect(config.mutationFn({ captureId: 'c1' })).rejects.toThrow('boom');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useCommitProposalCapture (Phase 3 / C-A2, migration 00516)
// ─────────────────────────────────────────────────────────────────────────────

describe('useCommitProposalCapture', () => {
  it('calls the commit_proposal_capture RPC with mapped argument names, including the idempotency key', async () => {
    rpcMock.mockResolvedValue({
      data: {
        capture_id: 'cap-1',
        product_id: 'prod-1',
        status: 'inbox',
        created: true,
        enrichment_run_id: 'run-1',
      },
      error: null,
    });

    const config = useCommitProposalCapture() as unknown as {
      mutationFn: (input: {
        clientCaptureId: string;
        payload: { name: string; sourceUrl: string };
        styleIds?: string[];
        proposalId?: string | null;
        scopeRoomId?: string | null;
        ffeCategorySlug?: string | null;
      }) => Promise<unknown>;
    };

    const result = await config.mutationFn({
      clientCaptureId: 'client-cap-1',
      payload: { name: 'Coastal armchair', sourceUrl: 'https://example.com/armchair' },
      styleIds: ['s1'],
      proposalId: 'p1',
      scopeRoomId: 'r1',
      ffeCategorySlug: 'seating',
    });

    expect(rpcMock).toHaveBeenCalledWith('commit_proposal_capture', {
      p_client_capture_id: 'client-cap-1',
      p_payload: { name: 'Coastal armchair', sourceUrl: 'https://example.com/armchair' },
      p_style_ids: ['s1'],
      p_proposal_id: 'p1',
      p_scope_room_id: 'r1',
      p_ffe_category_slug: 'seating',
    });
    expect(result).toEqual({
      captureId: 'cap-1',
      productId: 'prod-1',
      status: 'inbox',
      created: true,
      enrichmentRunId: 'run-1',
    });
  });

  it('omits optional targeting args instead of sending null', async () => {
    rpcMock.mockResolvedValue({
      data: { capture_id: 'cap-2', product_id: 'prod-2', status: 'inbox', created: true, enrichment_run_id: null },
      error: null,
    });

    const config = useCommitProposalCapture() as unknown as {
      mutationFn: (input: {
        clientCaptureId: string;
        payload: { sourceUrl: string };
      }) => Promise<unknown>;
    };

    await config.mutationFn({
      clientCaptureId: 'client-cap-2',
      payload: { sourceUrl: 'https://example.com/bench' },
    });

    const callArgs = rpcMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(callArgs.p_client_capture_id).toBe('client-cap-2');
    expect('p_proposal_id' in callArgs ? callArgs.p_proposal_id : undefined).toBeUndefined();
    expect('p_style_ids' in callArgs ? callArgs.p_style_ids : undefined).toBeUndefined();
  });

  it('rethrows RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('payload.sourceUrl is required') });

    const config = useCommitProposalCapture() as unknown as {
      mutationFn: (input: {
        clientCaptureId: string;
        payload: Record<string, unknown>;
      }) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({ clientCaptureId: 'client-cap-3', payload: {} })
    ).rejects.toThrow('payload.sourceUrl is required');
  });
});
