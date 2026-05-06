import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (mirrors the use-phase-gates / use-phase-deliverables test rigs)
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
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
  builder.order = record('order');
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
  auth: { getUser: vi.fn() },
  from: vi.fn((table: string) => {
    if (!builders[table]) builders[table] = makeBuilder();
    return builders[table];
  }),
  rpc: vi.fn(),
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
  usePhaseTemplates,
  useApplyPhaseTemplate,
  type PhaseTemplate,
} from '../use-phase-templates';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockReset();
  supabaseClient.auth.getUser.mockReset();
  supabaseClient.rpc.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// usePhaseTemplates
// ─────────────────────────────────────────────────────────────────────────────

describe('usePhaseTemplates', () => {
  it('selects every visible template ordered by label asc', async () => {
    const sample: PhaseTemplate[] = [
      {
        id: 't1',
        slug: 'classic_5_phase',
        label: 'Classic 5-Phase Residential',
        description: null,
        is_system: true,
        designer_id: null,
        phases: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 't2',
        slug: 'design_only',
        label: 'Design-Only (no procurement)',
        description: null,
        is_system: true,
        designer_id: null,
        phases: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
    const builder = setTableResult('phase_templates', { data: sample, error: null });

    const config = usePhaseTemplates() as unknown as {
      queryFn: () => Promise<PhaseTemplate[]>;
    };
    const result = await config.queryFn();

    expect(result).toHaveLength(2);
    expect(builder.__chain.find((c) => c.method === 'select')?.args).toEqual(['*']);
    expect(builder.__chain.find((c) => c.method === 'order')?.args).toEqual([
      'label',
      { ascending: true },
    ]);
  });

  it('throws when the select errors', async () => {
    setTableResult('phase_templates', { data: null, error: new Error('boom') });
    const config = usePhaseTemplates() as unknown as {
      queryFn: () => Promise<PhaseTemplate[]>;
    };
    await expect(config.queryFn()).rejects.toThrow('boom');
  });

  it('returns an empty array when supabase returns null data', async () => {
    setTableResult('phase_templates', { data: null, error: null });
    const config = usePhaseTemplates() as unknown as {
      queryFn: () => Promise<PhaseTemplate[]>;
    };
    const result = await config.queryFn();
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useApplyPhaseTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe('useApplyPhaseTemplate', () => {
  it('calls the apply_phase_template RPC with the proposal id + slug', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: ['p1', 'p2', 'p3'],
      error: null,
    });

    const config = useApplyPhaseTemplate() as unknown as {
      mutationFn: (input: { proposalId: string; templateSlug: string }) => Promise<string[]>;
    };

    const result = await config.mutationFn({
      proposalId: 'prop-1',
      templateSlug: 'classic_5_phase',
    });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('apply_phase_template', {
      p_proposal_id: 'prop-1',
      p_template_slug: 'classic_5_phase',
    });
    expect(result).toEqual(['p1', 'p2', 'p3']);
  });

  it('normalizes a list of {apply_phase_template: id} rows to a flat string[]', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: [
        { apply_phase_template: 'a' },
        { apply_phase_template: 'b' },
      ],
      error: null,
    });

    const config = useApplyPhaseTemplate() as unknown as {
      mutationFn: (input: { proposalId: string; templateSlug: string }) => Promise<string[]>;
    };

    const result = await config.mutationFn({
      proposalId: 'prop-1',
      templateSlug: 'fast_track',
    });

    expect(result).toEqual(['a', 'b']);
  });

  it('returns [] when the RPC returns null', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: null, error: null });

    const config = useApplyPhaseTemplate() as unknown as {
      mutationFn: (input: { proposalId: string; templateSlug: string }) => Promise<string[]>;
    };

    const result = await config.mutationFn({
      proposalId: 'prop-1',
      templateSlug: 'classic_5_phase',
    });

    expect(result).toEqual([]);
  });

  it('throws when the RPC errors', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: new Error('proposal not found or not owned by caller'),
    });

    const config = useApplyPhaseTemplate() as unknown as {
      mutationFn: (input: { proposalId: string; templateSlug: string }) => Promise<string[]>;
    };

    await expect(
      config.mutationFn({ proposalId: 'prop-1', templateSlug: 'classic_5_phase' })
    ).rejects.toThrow('proposal not found or not owned by caller');
  });

  it('invalidates proposal phase + scope summary queries on success', () => {
    const config = useApplyPhaseTemplate() as unknown as {
      onSuccess: (
        phaseIds: string[],
        input: { proposalId: string; templateSlug: string }
      ) => void;
    };

    config.onSuccess(['p1'], { proposalId: 'prop-1', templateSlug: 'classic_5_phase' });

    const calls = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(calls).toContainEqual(['proposal-phases', 'prop-1']);
    expect(calls).toContainEqual(['scope-builder-summary', 'prop-1']);
    expect(calls).toContainEqual(['phase-deliverables']);
    expect(calls).toContainEqual(['phase-gates']);
  });
});
