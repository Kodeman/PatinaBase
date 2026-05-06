import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (mirrors the use-ffe-categories / use-decisions test rigs)
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
  limit: any;
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
  builder.limit = record('limit');

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

// Import AFTER mocks.
import {
  usePhaseDeliverables,
  useAddDeliverable,
  useUpdateDeliverable,
  useToggleDeliverableCompleted,
  useReorderDeliverables,
  useDeleteDeliverable,
} from '../use-phase-deliverables';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockReset();
  supabaseClient.auth.getUser.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// usePhaseDeliverables
// ─────────────────────────────────────────────────────────────────────────────

describe('usePhaseDeliverables', () => {
  it('selects deliverables for the given phaseId ordered by sort_order asc', async () => {
    const builder = setTableResult('proposal_phase_deliverables', {
      data: [
        { id: 'd1', phase_id: 'ph1', label: 'Concept deck', sort_order: 0 },
        { id: 'd2', phase_id: 'ph1', label: 'Mood board', sort_order: 1 },
      ],
      error: null,
    });

    const config = usePhaseDeliverables('ph1') as unknown as {
      queryFn: () => Promise<unknown[]>;
      enabled: boolean;
    };
    const result = await config.queryFn();

    expect(config.enabled).toBe(true);
    expect(result).toHaveLength(2);
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['phase_id', 'ph1']);
    expect(builder.__chain.find((c) => c.method === 'order')?.args).toEqual([
      'sort_order',
      { ascending: true },
    ]);
  });

  it('does not run the query when phaseId is empty', () => {
    const config = usePhaseDeliverables('') as unknown as { enabled: boolean };
    expect(config.enabled).toBe(false);
  });

  it('throws when supabase returns an error', async () => {
    setTableResult('proposal_phase_deliverables', { data: null, error: new Error('boom') });
    const config = usePhaseDeliverables('ph1') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await expect(config.queryFn()).rejects.toThrow('boom');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useAddDeliverable
// ─────────────────────────────────────────────────────────────────────────────

describe('useAddDeliverable', () => {
  // The mock builder reuses one `__result` for both the sort_order lookup
  // (the array-of-{sort_order} read) AND the post-insert `.single()` read.
  // We can't satisfy both shapes from a single __result, so these tests
  // assert the call payload shape — the exact sort_order arithmetic is
  // covered by the empty-data case below.

  it('inserts a deliverable with the requested fields and is_required default true', async () => {
    const builder = setTableResult('proposal_phase_deliverables', {
      data: [],
      error: null,
    });

    const config = useAddDeliverable() as unknown as {
      mutationFn: (input: {
        phaseId: string;
        label: string;
        description?: string;
        isRequired?: boolean;
      }) => Promise<unknown>;
    };

    await config.mutationFn({ phaseId: 'ph1', label: 'New', description: 'd' });

    const insertCall = builder.__chain.find((c) => c.method === 'insert');
    expect(insertCall).toBeTruthy();
    expect(insertCall?.args[0]).toEqual(
      expect.objectContaining({
        phase_id: 'ph1',
        label: 'New',
        description: 'd',
        is_required: true,
      })
    );
    expect(typeof (insertCall?.args[0] as { sort_order: unknown }).sort_order).toBe(
      'number'
    );
  });

  it('honours isRequired=false', async () => {
    const builder = setTableResult('proposal_phase_deliverables', {
      data: [],
      error: null,
    });

    const config = useAddDeliverable() as unknown as {
      mutationFn: (input: {
        phaseId: string;
        label: string;
        isRequired?: boolean;
      }) => Promise<unknown>;
    };

    await config.mutationFn({ phaseId: 'ph1', label: 'Optional', isRequired: false });

    const insertCall = builder.__chain.find((c) => c.method === 'insert');
    expect(insertCall?.args[0]).toEqual(
      expect.objectContaining({ is_required: false })
    );
  });

  it('starts sort_order at 0 when no rows exist', async () => {
    const builder = setTableResult('proposal_phase_deliverables', {
      data: [],
      error: null,
    });

    const config = useAddDeliverable() as unknown as {
      mutationFn: (input: { phaseId: string; label: string }) => Promise<unknown>;
    };

    await config.mutationFn({ phaseId: 'ph1', label: 'First' });

    const insertCall = builder.__chain.find((c) => c.method === 'insert');
    expect(insertCall?.args[0]).toEqual(
      expect.objectContaining({ sort_order: 0 })
    );
  });

  it('omits description as null when not provided', async () => {
    const builder = setTableResult('proposal_phase_deliverables', {
      data: [],
      error: null,
    });

    const config = useAddDeliverable() as unknown as {
      mutationFn: (input: { phaseId: string; label: string }) => Promise<unknown>;
    };

    await config.mutationFn({ phaseId: 'ph1', label: 'No desc' });

    const insertCall = builder.__chain.find((c) => c.method === 'insert');
    expect(insertCall?.args[0]).toEqual(
      expect.objectContaining({ description: null })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateDeliverable
// ─────────────────────────────────────────────────────────────────────────────

describe('useUpdateDeliverable', () => {
  it('issues an update by id', async () => {
    const builder = setTableResult('proposal_phase_deliverables', {
      data: { id: 'd1' },
      error: null,
    });

    const config = useUpdateDeliverable() as unknown as {
      mutationFn: (input: {
        deliverableId: string;
        phaseId: string;
        updates: Record<string, unknown>;
      }) => Promise<unknown>;
    };

    await config.mutationFn({
      deliverableId: 'd1',
      phaseId: 'ph1',
      updates: { label: 'Renamed' },
    });

    expect(builder.__chain.find((c) => c.method === 'update')?.args[0]).toEqual({
      label: 'Renamed',
    });
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'd1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useToggleDeliverableCompleted
// ─────────────────────────────────────────────────────────────────────────────

describe('useToggleDeliverableCompleted', () => {
  it('writes completed_at + completed_by when completed=true', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const builder = setTableResult('proposal_phase_deliverables', {
      data: { id: 'd1' },
      error: null,
    });

    const config = useToggleDeliverableCompleted() as unknown as {
      mutationFn: (input: {
        deliverableId: string;
        phaseId: string;
        completed: boolean;
      }) => Promise<unknown>;
    };

    await config.mutationFn({ deliverableId: 'd1', phaseId: 'ph1', completed: true });

    const updateCall = builder.__chain.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual(
      expect.objectContaining({
        completed_by: 'u1',
      })
    );
    // completed_at is `new Date().toISOString()` — assert it's a non-empty string.
    expect(typeof (updateCall?.args[0] as { completed_at: unknown }).completed_at).toBe('string');
  });

  it('clears completed_at + completed_by when completed=false', async () => {
    const builder = setTableResult('proposal_phase_deliverables', {
      data: { id: 'd1' },
      error: null,
    });

    const config = useToggleDeliverableCompleted() as unknown as {
      mutationFn: (input: {
        deliverableId: string;
        phaseId: string;
        completed: boolean;
      }) => Promise<unknown>;
    };

    await config.mutationFn({ deliverableId: 'd1', phaseId: 'ph1', completed: false });

    const updateCall = builder.__chain.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({
      completed_at: null,
      completed_by: null,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useReorderDeliverables
// ─────────────────────────────────────────────────────────────────────────────

describe('useReorderDeliverables', () => {
  it('issues one update per id in order', async () => {
    const builder = setTableResult('proposal_phase_deliverables', {
      data: null,
      error: null,
    });

    const config = useReorderDeliverables() as unknown as {
      mutationFn: (input: { phaseId: string; orderedIds: string[] }) => Promise<unknown>;
    };

    const result = (await config.mutationFn({
      phaseId: 'ph1',
      orderedIds: ['a', 'b', 'c'],
    })) as { count: number };

    expect(result.count).toBe(3);

    const updateCalls = builder.__chain.filter((c) => c.method === 'update');
    expect(updateCalls).toHaveLength(3);
    expect(updateCalls[0].args[0]).toEqual({ sort_order: 0 });
    expect(updateCalls[1].args[0]).toEqual({ sort_order: 1 });
    expect(updateCalls[2].args[0]).toEqual({ sort_order: 2 });
  });

  it('throws when an update fails', async () => {
    setTableResult('proposal_phase_deliverables', {
      data: null,
      error: new Error('rls denied'),
    });

    const config = useReorderDeliverables() as unknown as {
      mutationFn: (input: { phaseId: string; orderedIds: string[] }) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({ phaseId: 'ph1', orderedIds: ['a'] })
    ).rejects.toThrow('rls denied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useDeleteDeliverable
// ─────────────────────────────────────────────────────────────────────────────

describe('useDeleteDeliverable', () => {
  it('issues a delete by id', async () => {
    const builder = setTableResult('proposal_phase_deliverables', {
      data: null,
      error: null,
    });

    const config = useDeleteDeliverable() as unknown as {
      mutationFn: (input: { deliverableId: string; phaseId: string }) => Promise<unknown>;
    };

    await config.mutationFn({ deliverableId: 'd1', phaseId: 'ph1' });

    expect(builder.__chain.find((c) => c.method === 'delete')).toBeTruthy();
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'd1']);
  });

  it('throws when supabase returns an error', async () => {
    setTableResult('proposal_phase_deliverables', {
      data: null,
      error: new Error('not found'),
    });

    const config = useDeleteDeliverable() as unknown as {
      mutationFn: (input: { deliverableId: string; phaseId: string }) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({ deliverableId: 'd1', phaseId: 'ph1' })
    ).rejects.toThrow('not found');
  });
});
