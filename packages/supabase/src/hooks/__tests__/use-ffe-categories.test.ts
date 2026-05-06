import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (mirrors use-decisions.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: any;
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

// Import AFTER the mocks are wired up.
import {
  useFFECategories,
  useCreateFFECategory,
  useDeleteFFECategory,
  slugifyFFECategoryLabel,
} from '../use-ffe-categories';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockReset();
  supabaseClient.auth.getUser.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// slugifyFFECategoryLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('slugifyFFECategoryLabel', () => {
  it('lowercases and underscores', () => {
    expect(slugifyFFECategoryLabel('Custom Lighting')).toBe('custom_lighting');
  });

  it('collapses runs of non-alphanumerics into a single underscore', () => {
    expect(slugifyFFECategoryLabel('Built-Ins / Casework!')).toBe('built_ins_casework');
  });

  it('trims leading/trailing underscores', () => {
    expect(slugifyFFECategoryLabel('  ___Window Treatments___  ')).toBe('window_treatments');
  });

  it('returns empty string for purely non-alphanumeric input', () => {
    expect(slugifyFFECategoryLabel('!!!')).toBe('');
  });

  it('preserves digits', () => {
    expect(slugifyFFECategoryLabel('Lighting 2.0')).toBe('lighting_2_0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useFFECategories
// ─────────────────────────────────────────────────────────────────────────────

describe('useFFECategories', () => {
  it('returns system + designer rows when no proposalId is given', async () => {
    setTableResult('ffe_categories', {
      data: [
        { id: '1', slug: 'seating',  label: 'Seating', is_system: true,  designer_id: null,  proposal_id: null, sort_order: 10, icon: 'armchair', parent_id: null },
        { id: '2', slug: 'custom_a', label: 'Custom A', is_system: false, designer_id: 'u1', proposal_id: null, sort_order: 0,  icon: null,        parent_id: null },
        { id: '3', slug: 'foo',      label: 'Foo',      is_system: false, designer_id: null, proposal_id: 'p1', sort_order: 0,  icon: null,        parent_id: null },
      ],
      error: null,
    });

    const config = useFFECategories() as unknown as { queryFn: () => Promise<unknown[]> };
    const result = await config.queryFn();

    // Proposal-only rows from a stranger proposal must not leak in.
    expect(result.map((r) => (r as { id: string }).id)).toEqual(['1', '2']);
  });

  it('includes the proposal-scoped rows when proposalId matches', async () => {
    setTableResult('ffe_categories', {
      data: [
        { id: '1', slug: 'seating', label: 'Seating', is_system: true,  designer_id: null,  proposal_id: null, sort_order: 10, icon: 'armchair', parent_id: null },
        { id: '2', slug: 'custom_p', label: 'Custom P', is_system: false, designer_id: null, proposal_id: 'p1', sort_order: 0,  icon: null,        parent_id: null },
        { id: '3', slug: 'custom_q', label: 'Custom Q', is_system: false, designer_id: null, proposal_id: 'p2', sort_order: 0,  icon: null,        parent_id: null },
      ],
      error: null,
    });

    const config = useFFECategories({ proposalId: 'p1' }) as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    const result = await config.queryFn();

    expect(result.map((r) => (r as { id: string }).id)).toEqual(['1', '2']);
  });

  it('throws when supabase returns an error', async () => {
    setTableResult('ffe_categories', { data: null, error: new Error('boom') });
    const config = useFFECategories() as unknown as { queryFn: () => Promise<unknown[]> };
    await expect(config.queryFn()).rejects.toThrow('boom');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useCreateFFECategory
// ─────────────────────────────────────────────────────────────────────────────

describe('useCreateFFECategory', () => {
  it('inserts a designer-scoped row when no proposalId is provided', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'designer-1' } } });
    const builder = setTableResult('ffe_categories', {
      data: { id: 'new', slug: 'custom_lighting', label: 'Custom Lighting', is_system: false, designer_id: 'designer-1', proposal_id: null },
      error: null,
    });

    const config = useCreateFFECategory() as unknown as {
      mutationFn: (input: { label: string; proposalId?: string }) => Promise<unknown>;
    };

    await config.mutationFn({ label: 'Custom Lighting' });

    const insertCall = builder.__chain.find((c) => c.method === 'insert');
    expect(insertCall).toBeTruthy();
    expect(insertCall?.args[0]).toEqual(
      expect.objectContaining({
        slug: 'custom_lighting',
        label: 'Custom Lighting',
        is_system: false,
        designer_id: 'designer-1',
        proposal_id: null,
      })
    );
  });

  it('inserts a proposal-scoped row when proposalId is provided', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'designer-1' } } });
    const builder = setTableResult('ffe_categories', {
      data: { id: 'new', slug: 'custom_p', label: 'Custom P', is_system: false, designer_id: null, proposal_id: 'p1' },
      error: null,
    });

    const config = useCreateFFECategory() as unknown as {
      mutationFn: (input: { label: string; proposalId?: string }) => Promise<unknown>;
    };

    await config.mutationFn({ label: 'Custom P', proposalId: 'p1' });

    const insertCall = builder.__chain.find((c) => c.method === 'insert');
    expect(insertCall?.args[0]).toEqual(
      expect.objectContaining({
        slug: 'custom_p',
        is_system: false,
        designer_id: null,
        proposal_id: 'p1',
      })
    );
  });

  it('throws when the user is not authenticated', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    setTableResult('ffe_categories', { data: null, error: null });

    const config = useCreateFFECategory() as unknown as {
      mutationFn: (input: { label: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ label: 'Foo' })).rejects.toThrow('Not authenticated');
  });

  it('throws when the slug is empty', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    setTableResult('ffe_categories', { data: null, error: null });

    const config = useCreateFFECategory() as unknown as {
      mutationFn: (input: { label: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ label: '!!!' })).rejects.toThrow(/Invalid label/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useDeleteFFECategory
// ─────────────────────────────────────────────────────────────────────────────

describe('useDeleteFFECategory', () => {
  it('issues a delete by id', async () => {
    const builder = setTableResult('ffe_categories', { data: null, error: null });

    const config = useDeleteFFECategory() as unknown as {
      mutationFn: (input: { id: string }) => Promise<unknown>;
    };

    await config.mutationFn({ id: 'cat-123' });

    expect(builder.__chain.find((c) => c.method === 'delete')).toBeTruthy();
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['id', 'cat-123']);
  });

  it('throws when supabase returns an error', async () => {
    setTableResult('ffe_categories', { data: null, error: new Error('rls denied') });

    const config = useDeleteFFECategory() as unknown as {
      mutationFn: (input: { id: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ id: 'cat-1' })).rejects.toThrow('rls denied');
  });
});
