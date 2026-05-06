import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (matches the use-phase-deliverables / use-decisions test rigs)
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
  usePhaseGates,
  useAddGate,
  useUpdateGate,
  useRemoveGate,
  useSatisfyGate,
  useDesignerOverrideGate,
  computePhaseGateStatus,
  type PhaseGate,
} from '../use-phase-gates';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockReset();
  supabaseClient.auth.getUser.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// computePhaseGateStatus
// ─────────────────────────────────────────────────────────────────────────────

function makeGate(overrides: Partial<PhaseGate> = {}): PhaseGate {
  return {
    id: 'g',
    phase_id: 'ph1',
    gate_kind: 'client_signature',
    payload: {},
    satisfied_at: null,
    satisfied_by: null,
    override_reason: null,
    sort_order: 0,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('computePhaseGateStatus', () => {
  it('returns "pending" when there are no gates', () => {
    expect(computePhaseGateStatus([])).toBe('pending');
  });

  it('returns "passed" when every gate is satisfied', () => {
    expect(
      computePhaseGateStatus([
        makeGate({ id: 'a', satisfied_at: '2025-01-02T00:00:00Z' }),
        makeGate({ id: 'b', satisfied_at: '2025-01-03T00:00:00Z' }),
      ])
    ).toBe('passed');
  });

  it('returns "blocked" when at least one gate is unsatisfied and no designer override exists', () => {
    expect(
      computePhaseGateStatus([
        makeGate({ id: 'a', satisfied_at: '2025-01-02T00:00:00Z' }),
        makeGate({ id: 'b', satisfied_at: null }),
      ])
    ).toBe('blocked');
  });

  it('returns "passed" when there is a satisfied designer_override row even if other gates are unsatisfied', () => {
    expect(
      computePhaseGateStatus([
        makeGate({ id: 'a', satisfied_at: null }),
        makeGate({
          id: 'override',
          gate_kind: 'designer_override',
          satisfied_at: '2025-01-02T00:00:00Z',
        }),
      ])
    ).toBe('passed');
  });

  it('does NOT treat an UNSATISFIED designer_override as a free pass', () => {
    expect(
      computePhaseGateStatus([
        makeGate({ id: 'a', satisfied_at: null }),
        makeGate({ id: 'override', gate_kind: 'designer_override', satisfied_at: null }),
      ])
    ).toBe('blocked');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// usePhaseGates
// ─────────────────────────────────────────────────────────────────────────────

describe('usePhaseGates', () => {
  it('selects gates for the given phaseId ordered by sort_order asc', async () => {
    const builder = setTableResult('proposal_phase_gates', {
      data: [
        { id: 'g1', phase_id: 'ph1', gate_kind: 'client_signature', sort_order: 0 },
        {
          id: 'g2',
          phase_id: 'ph1',
          gate_kind: 'deliverables_complete',
          sort_order: 1,
        },
      ],
      error: null,
    });

    const config = usePhaseGates('ph1') as unknown as {
      queryFn: () => Promise<unknown[]>;
      enabled: boolean;
    };
    const result = await config.queryFn();

    expect(config.enabled).toBe(true);
    expect(result).toHaveLength(2);
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual([
      'phase_id',
      'ph1',
    ]);
  });

  it('does not run the query when phaseId is empty', () => {
    const config = usePhaseGates('') as unknown as { enabled: boolean };
    expect(config.enabled).toBe(false);
  });

  it('throws when supabase returns an error', async () => {
    setTableResult('proposal_phase_gates', { data: null, error: new Error('boom') });
    const config = usePhaseGates('ph1') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await expect(config.queryFn()).rejects.toThrow('boom');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useAddGate
// ─────────────────────────────────────────────────────────────────────────────

describe('useAddGate', () => {
  // Same caveat as useAddDeliverable: the mock builder reuses one __result
  // for both the sort_order lookup AND the post-insert .single() read, so
  // these tests assert the call payload shape rather than the exact
  // sort_order value. Sort_order arithmetic is exercised in the empty-data
  // case below.

  it('inserts a gate carrying the given gate_kind + payload', async () => {
    const builder = setTableResult('proposal_phase_gates', {
      data: [],
      error: null,
    });

    const config = useAddGate() as unknown as {
      mutationFn: (input: {
        phaseId: string;
        gateKind: string;
        payload?: Record<string, unknown>;
      }) => Promise<unknown>;
    };

    await config.mutationFn({
      phaseId: 'ph1',
      gateKind: 'client_signature',
      payload: { artifact_label: 'Concept presentation' },
    });

    const insertCall = builder.__chain.find((c) => c.method === 'insert');
    expect(insertCall).toBeTruthy();
    expect(insertCall?.args[0]).toEqual(
      expect.objectContaining({
        phase_id: 'ph1',
        gate_kind: 'client_signature',
        payload: { artifact_label: 'Concept presentation' },
      })
    );
    expect(typeof (insertCall?.args[0] as { sort_order: unknown }).sort_order).toBe(
      'number'
    );
  });

  it('defaults payload to empty object and sort_order to 0 when no rows exist', async () => {
    const builder = setTableResult('proposal_phase_gates', {
      data: [],
      error: null,
    });

    const config = useAddGate() as unknown as {
      mutationFn: (input: {
        phaseId: string;
        gateKind: string;
        payload?: Record<string, unknown>;
      }) => Promise<unknown>;
    };

    await config.mutationFn({ phaseId: 'ph1', gateKind: 'deliverables_complete' });

    const insertCall = builder.__chain.find((c) => c.method === 'insert');
    expect(insertCall?.args[0]).toEqual(
      expect.objectContaining({ payload: {}, sort_order: 0 })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateGate / useRemoveGate
// ─────────────────────────────────────────────────────────────────────────────

describe('useUpdateGate', () => {
  it('issues an update by id', async () => {
    const builder = setTableResult('proposal_phase_gates', {
      data: { id: 'g1' },
      error: null,
    });

    const config = useUpdateGate() as unknown as {
      mutationFn: (input: {
        gateId: string;
        phaseId: string;
        updates: Record<string, unknown>;
      }) => Promise<unknown>;
    };

    await config.mutationFn({
      gateId: 'g1',
      phaseId: 'ph1',
      updates: { payload: { artifact_label: 'Updated' } },
    });

    expect(builder.__chain.find((c) => c.method === 'update')?.args[0]).toEqual({
      payload: { artifact_label: 'Updated' },
    });
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'g1']);
  });
});

describe('useRemoveGate', () => {
  it('issues a delete by id', async () => {
    const builder = setTableResult('proposal_phase_gates', { data: null, error: null });

    const config = useRemoveGate() as unknown as {
      mutationFn: (input: { gateId: string; phaseId: string }) => Promise<unknown>;
    };

    await config.mutationFn({ gateId: 'g1', phaseId: 'ph1' });

    expect(builder.__chain.find((c) => c.method === 'delete')).toBeTruthy();
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'g1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useSatisfyGate
// ─────────────────────────────────────────────────────────────────────────────

describe('useSatisfyGate', () => {
  it('writes satisfied_at + satisfied_by from auth.uid()', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const builder = setTableResult('proposal_phase_gates', {
      data: { id: 'g1' },
      error: null,
    });

    const config = useSatisfyGate() as unknown as {
      mutationFn: (input: { gateId: string; phaseId: string }) => Promise<unknown>;
    };

    await config.mutationFn({ gateId: 'g1', phaseId: 'ph1' });

    const updateCall = builder.__chain.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual(
      expect.objectContaining({ satisfied_by: 'u1' })
    );
    expect(typeof (updateCall?.args[0] as { satisfied_at: unknown }).satisfied_at).toBe(
      'string'
    );
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'g1']);
  });

  it('handles missing user gracefully (satisfied_by=null)', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    const builder = setTableResult('proposal_phase_gates', {
      data: { id: 'g1' },
      error: null,
    });

    const config = useSatisfyGate() as unknown as {
      mutationFn: (input: { gateId: string; phaseId: string }) => Promise<unknown>;
    };

    await config.mutationFn({ gateId: 'g1', phaseId: 'ph1' });

    const updateCall = builder.__chain.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual(
      expect.objectContaining({ satisfied_by: null })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useDesignerOverrideGate
// ─────────────────────────────────────────────────────────────────────────────

describe('useDesignerOverrideGate', () => {
  it('inserts a designer_override row pre-satisfied with reason', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const builder = setTableResult('proposal_phase_gates', {
      data: [],
      error: null,
    });

    const config = useDesignerOverrideGate() as unknown as {
      mutationFn: (input: { phaseId: string; reason: string }) => Promise<unknown>;
    };

    await config.mutationFn({ phaseId: 'ph1', reason: 'Client confirmed verbally' });

    const insertCall = builder.__chain.find((c) => c.method === 'insert');
    expect(insertCall).toBeTruthy();
    const args = insertCall?.args[0] as Record<string, unknown>;
    expect(args).toEqual(
      expect.objectContaining({
        phase_id: 'ph1',
        gate_kind: 'designer_override',
        override_reason: 'Client confirmed verbally',
        satisfied_by: 'u1',
        payload: {},
      })
    );
    expect(typeof args.satisfied_at).toBe('string');
    expect(typeof args.sort_order).toBe('number');
  });
});
