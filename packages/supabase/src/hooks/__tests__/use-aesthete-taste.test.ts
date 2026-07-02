import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — mirrors the use-invoices rig. Wave 3B: judgments (probe-first deck,
// submit RPC), corrections, and the "Your Eye" reads/overrides.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown; count?: number | null };

function makeBuilder(result: BuilderResult) {
  const chain: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> & { __chain: typeof chain } = { __chain: chain };
  for (const m of ['select', 'eq', 'order', 'limit', 'lte', 'in']) {
    builder[m] = vi.fn((...args: unknown[]) => {
      chain.push({ method: m, args });
      return builder;
    });
  }
  builder.maybeSingle = vi.fn(() => {
    chain.push({ method: 'maybeSingle', args: [] });
    return Promise.resolve(result);
  });
  builder.then = (resolve: (v: BuilderResult) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

const builders: Record<string, ReturnType<typeof makeBuilder>> = {};

function setTableResult(table: string, result: BuilderResult) {
  builders[table] = makeBuilder(result);
  return builders[table];
}

const supabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn((table: string) => {
    if (!builders[table]) builders[table] = makeBuilder({ data: null, error: null });
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
  buildJudgmentDeck,
  nudgeBiasStrength,
  useDueTasteProbes,
  useJudgmentPool,
  useMyJudgmentCount,
  useSubmitTasteJudgment,
  useSubmitTasteCorrection,
  useMyTasteProfile,
  useMySignatureBiases,
  useUpdateMyBiases,
  useMyStyleConfidence,
  type JudgmentProduct,
  type TasteProbeRow,
} from '../use-aesthete-taste';

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(builders).forEach((k) => delete builders[k]);
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => c[0].queryKey);

const product = (id: string): JudgmentProduct => ({
  id,
  name: `Piece ${id}`,
  brand: null,
  images: null,
});

const probe = (id: number, a: string, b: string): TasteProbeRow => ({
  id,
  product_a: a,
  product_b: b,
  due_at: '2026-06-01T00:00:00Z',
  status: 'pending',
});

// ─────────────────────────────────────────────────────────────────────────────
// buildJudgmentDeck — §8.3 probe-first, indistinguishable
// ─────────────────────────────────────────────────────────────────────────────

describe('buildJudgmentDeck', () => {
  const pool = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(product);
  const rng = () => 0.99; // deterministic shuffle (identity-ish)

  it('serves due probe pairs first, in stored (reversed) order', () => {
    const deck = buildJudgmentDeck([probe(1, 'p3', 'p1'), probe(2, 'p5', 'p2')], pool, { rng });
    expect(deck[0].a.id).toBe('p3');
    expect(deck[0].b.id).toBe('p1');
    expect(deck[1].a.id).toBe('p5');
    expect(deck[1].b.id).toBe('p2');
  });

  it('probe pairs carry no marker distinguishing them from fresh pairs', () => {
    const deck = buildJudgmentDeck([probe(1, 'p3', 'p1')], pool, { rng });
    // Same shape for every entry: exactly {a, b} — nothing else to render.
    for (const pair of deck) {
      expect(Object.keys(pair).sort()).toEqual(['a', 'b']);
    }
  });

  it('skips probes whose products fell out of the visible pool', () => {
    const deck = buildJudgmentDeck([probe(1, 'gone', 'p1')], pool, { rng });
    expect(deck.every((p) => p.a.id !== 'gone' && p.b.id !== 'gone')).toBe(true);
  });

  it('fresh pairs use each product at most once and never duplicate a probe pair', () => {
    const deck = buildJudgmentDeck([probe(1, 'p2', 'p1')], pool, { rng });
    const freshPairs = deck.slice(1);
    const seen = new Set<string>();
    for (const pair of freshPairs) {
      expect(seen.has(pair.a.id)).toBe(false);
      expect(seen.has(pair.b.id)).toBe(false);
      seen.add(pair.a.id);
      seen.add(pair.b.id);
      const key = [pair.a.id, pair.b.id].sort().join('|');
      expect(key).not.toBe('p1|p2');
    }
  });

  it('respects maxPairs', () => {
    const deck = buildJudgmentDeck([], pool, { rng, maxPairs: 2 });
    expect(deck.length).toBe(2);
  });

  it('handles an empty pool', () => {
    expect(buildJudgmentDeck([probe(1, 'p1', 'p2')], [], { rng })).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// nudgeBiasStrength — §8.5 bounded scalar ×[0.5, 1.5]
// ─────────────────────────────────────────────────────────────────────────────

describe('nudgeBiasStrength', () => {
  it('steps by a quarter of the learned strength', () => {
    expect(nudgeBiasStrength(0.8, 0.8, 'stronger')).toBeCloseTo(1.0);
    expect(nudgeBiasStrength(0.8, 0.8, 'softer')).toBeCloseTo(0.6);
  });

  it('clamps to [0.5, 1.5] × learned', () => {
    expect(nudgeBiasStrength(0.8, 1.15, 'stronger')).toBeCloseTo(1.2); // 1.5 × 0.8
    expect(nudgeBiasStrength(0.8, 0.45, 'softer')).toBeCloseTo(0.4); // 0.5 × 0.8
  });

  it('starts from learned when no displayed value exists yet', () => {
    expect(nudgeBiasStrength(0.4, null, 'stronger')).toBeCloseTo(0.5);
  });

  it('falls back to [0, 1] clamping when nothing was learned', () => {
    expect(nudgeBiasStrength(null, 0.9, 'stronger')).toBe(1);
    expect(nudgeBiasStrength(null, null, 'softer')).toBeCloseTo(0.375);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useDueTasteProbes / useJudgmentPool / useMyJudgmentCount
// ─────────────────────────────────────────────────────────────────────────────

interface QueryConfig {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
}

describe('useDueTasteProbes', () => {
  it('reads own pending probes due now, earliest first', async () => {
    const builder = setTableResult('taste_probe_queue', { data: [], error: null });
    const config = useDueTasteProbes() as unknown as QueryConfig;
    await config.queryFn();

    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['status', 'pending']);
    const lte = builder.__chain.find((c) => c.method === 'lte');
    expect(lte?.args[0]).toBe('due_at');
    expect(builder.__chain.find((c) => c.method === 'order')?.args[0]).toBe('due_at');
  });
});

describe('useJudgmentPool', () => {
  it('keeps only products with a canonical spectrum or a draft', async () => {
    setTableResult('products', {
      data: [
        { id: 'c', name: 'Canonical', brand: null, images: null, product_style_spectrum: { product_id: 'c' }, product_dna_drafts: [] },
        { id: 'd', name: 'Drafted', brand: 'B', images: ['u'], product_style_spectrum: null, product_dna_drafts: [{ product_id: 'd' }] },
        { id: 'n', name: 'Naked', brand: null, images: null, product_style_spectrum: null, product_dna_drafts: [] },
      ],
      error: null,
    });
    const config = useJudgmentPool() as unknown as QueryConfig;
    const rows = (await config.queryFn()) as JudgmentProduct[];
    expect(rows.map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('handles the 1:N array shape for the spectrum embed too', async () => {
    setTableResult('products', {
      data: [
        { id: 'c', name: 'C', brand: null, images: null, product_style_spectrum: [{ product_id: 'c' }], product_dna_drafts: [] },
      ],
      error: null,
    });
    const config = useJudgmentPool() as unknown as QueryConfig;
    const rows = (await config.queryFn()) as JudgmentProduct[];
    expect(rows.map((r) => r.id)).toEqual(['c']);
  });
});

describe('useMyJudgmentCount', () => {
  it('returns the exact head count', async () => {
    setTableResult('taste_judgments', { data: null, error: null, count: 17 });
    const config = useMyJudgmentCount() as unknown as QueryConfig;
    expect(await config.queryFn()).toBe(17);
  });

  it('returns 0 when count is null', async () => {
    setTableResult('taste_judgments', { data: null, error: null, count: null });
    const config = useMyJudgmentCount() as unknown as QueryConfig;
    expect(await config.queryFn()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useSubmitTasteJudgment / useSubmitTasteCorrection
// ─────────────────────────────────────────────────────────────────────────────

interface MutationConfig<I> {
  mutationFn: (input: I) => Promise<unknown>;
  onSuccess: () => void;
}

describe('useSubmitTasteJudgment', () => {
  it('calls the RPC with the §18 argument shape', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: { judgment_id: 1, kind: 'judgment', sources: { judgments: 1 } },
      error: null,
    });
    const config = useSubmitTasteJudgment() as unknown as MutationConfig<never>;
    const result = await config.mutationFn({
      productA: 'pa',
      productB: 'pb',
      choice: 'a',
      latencyMs: 1234,
    } as never);

    expect(supabaseClient.rpc).toHaveBeenCalledWith('submit_taste_judgment', {
      p_pair: { a: 'pa', b: 'pb' },
      p_choice: 'a',
      p_context: 'self',
      p_client_profile_id: null,
      p_latency_ms: 1234,
    });
    expect(result).toMatchObject({ kind: 'judgment' });
  });

  it('passes session_id inside p_pair when provided', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: {}, error: null });
    const config = useSubmitTasteJudgment() as unknown as MutationConfig<never>;
    await config.mutationFn({
      productA: 'pa',
      productB: 'pb',
      choice: 'both',
      sessionId: 's-1',
    } as never);

    expect(supabaseClient.rpc.mock.calls[0][1].p_pair).toEqual({
      a: 'pa',
      b: 'pb',
      session_id: 's-1',
    });
  });

  it('invalidates probes, profile, and count on success', () => {
    const config = useSubmitTasteJudgment() as unknown as MutationConfig<never>;
    config.onSuccess();
    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining([
        ['taste-probes-due'],
        ['my-taste-profile'],
        ['taste-judgment-count'],
      ]),
    );
  });

  it('throws on RPC error', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: null, error: new Error('nope') });
    const config = useSubmitTasteJudgment() as unknown as MutationConfig<never>;
    await expect(
      config.mutationFn({ productA: 'a', productB: 'b', choice: 'a' } as never),
    ).rejects.toThrow('nope');
  });
});

describe('useSubmitTasteCorrection', () => {
  it('calls the RPC with direction + surface', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: { correction_id: 9, sources: { corrections: 1 } },
      error: null,
    });
    const config = useSubmitTasteCorrection() as unknown as MutationConfig<never>;
    await config.mutationFn({
      subject: 'spectrum',
      productId: 'p-1',
      direction: { warmth: -0.3 },
      freeText: 'too industrial',
      surface: 'teaching',
    } as never);

    expect(supabaseClient.rpc).toHaveBeenCalledWith('submit_taste_correction', {
      p_subject: 'spectrum',
      p_product_id: 'p-1',
      p_replacement_product_id: null,
      p_client_profile_id: null,
      p_direction: { warmth: -0.3 },
      p_free_text: 'too industrial',
      p_surface: 'teaching',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// "Your Eye" reads + overrides
// ─────────────────────────────────────────────────────────────────────────────

describe('useMyTasteProfile', () => {
  it('returns null when signed out', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    const config = useMyTasteProfile() as unknown as QueryConfig;
    expect(await config.queryFn()).toBeNull();
  });

  it('reads own row by designer_id', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const builder = setTableResult('designer_taste_profiles', {
      data: { designer_id: 'u-1', warmth: 0.4, sources: { judgments: 12 } },
      error: null,
    });
    const config = useMyTasteProfile() as unknown as QueryConfig;
    const row = await config.queryFn();
    expect(row).toMatchObject({ designer_id: 'u-1' });
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual(['designer_id', 'u-1']);
  });
});

describe('useMySignatureBiases', () => {
  it('sinks muted biases to the end', async () => {
    setTableResult('signature_biases', {
      data: [
        { id: 'b1', status: 'muted', learned_strength: 0.9 },
        { id: 'b2', status: 'proposed', learned_strength: 0.7 },
        { id: 'b3', status: 'confirmed', learned_strength: 0.5 },
      ],
      error: null,
    });
    const config = useMySignatureBiases() as unknown as QueryConfig;
    const rows = (await config.queryFn()) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(['b2', 'b3', 'b1']);
  });
});

describe('useUpdateMyBiases', () => {
  it('sends overrides straight to update_my_biases and refreshes the list', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: { updated: 1 }, error: null });
    const config = useUpdateMyBiases() as unknown as MutationConfig<never>;
    await config.mutationFn([{ id: 'b-1', status: 'muted' }] as never);

    expect(supabaseClient.rpc).toHaveBeenCalledWith('update_my_biases', {
      p_overrides: [{ id: 'b-1', status: 'muted' }],
    });
    config.onSuccess();
    expect(invalidatedKeys()).toEqual(expect.arrayContaining([['my-signature-biases']]));
  });
});

describe('useMyStyleConfidence', () => {
  it('reads levels with style names, strongest first', async () => {
    const builder = setTableResult('designer_style_confidence', {
      data: [{ style_id: 's-1', level: 'expert', weight: 1, judgment_count: 40, style: { id: 's-1', name: 'Japandi' } }],
      error: null,
    });
    const config = useMyStyleConfidence() as unknown as QueryConfig;
    const rows = (await config.queryFn()) as Array<{ level: string }>;
    expect(rows[0].level).toBe('expert');
    expect(builder.__chain.find((c) => c.method === 'order')?.args[0]).toBe('weight');
  });
});
