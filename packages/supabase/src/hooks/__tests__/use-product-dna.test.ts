import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — mirrors the use-invoices rig. Wave 3B: draft reads for the teaching
// prefill (§5.2 canonical-else-draft) + the quiet draft-facts summarizer.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

function makeBuilder(result: BuilderResult) {
  const chain: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> & {
    __chain: typeof chain;
  } = { __chain: chain };
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
  from: vi.fn((table: string) => {
    if (!builders[table]) builders[table] = makeBuilder({ data: null, error: null });
    return builders[table];
  }),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

// Import AFTER mocks.
import {
  useProductDnaDraft,
  resolveSpectrumPrefill,
  summarizeDraftFacts,
  type DnaDraftBody,
} from '../use-product-dna';

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(builders).forEach((k) => delete builders[k]);
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveSpectrumPrefill — §5.2 canonical-else-draft
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveSpectrumPrefill', () => {
  const draft: DnaDraftBody = {
    style: {
      spectrums: { warmth: 0.6, complexity: -0.4, boldness: 0.1 },
      spectrum_conf: { warmth: 0.7, complexity: 0.6, boldness: 0.5 },
    },
  };

  it('prefers the canonical row when any dimension is set', () => {
    const out = resolveSpectrumPrefill({ warmth: 0.2, complexity: null } as never, draft);
    expect(out.source).toBe('canonical');
    expect(out.values).toEqual({ warmth: 0.2 });
    expect(out.confidence).toBeNull();
  });

  it('falls back to the draft spectrums when no canonical row exists', () => {
    const out = resolveSpectrumPrefill(null, draft);
    expect(out.source).toBe('draft');
    expect(out.values).toEqual({ warmth: 0.6, complexity: -0.4, boldness: 0.1 });
    expect(out.confidence).toEqual({ warmth: 0.7, complexity: 0.6, boldness: 0.5 });
  });

  it('treats an all-null canonical row as absent (draft wins)', () => {
    const empty = {
      warmth: null,
      complexity: null,
      formality: null,
      timelessness: null,
      boldness: null,
      craftsmanship: null,
    };
    const out = resolveSpectrumPrefill(empty, draft);
    expect(out.source).toBe('draft');
  });

  it('clamps out-of-range draft values to the CHECK range', () => {
    const wild: DnaDraftBody = { style: { spectrums: { warmth: 1.4, boldness: -3 } } };
    const out = resolveSpectrumPrefill(null, wild);
    expect(out.values).toEqual({ warmth: 1, boldness: -1 });
  });

  it('returns none when nothing exists', () => {
    expect(resolveSpectrumPrefill(null, null)).toEqual({
      values: {},
      source: 'none',
      confidence: null,
    });
    expect(resolveSpectrumPrefill(null, { style: {} }).source).toBe('none');
  });

  it('ignores non-numeric draft junk', () => {
    const junk = { style: { spectrums: { warmth: 'hot', complexity: NaN } } } as never;
    expect(resolveSpectrumPrefill(null, junk).source).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeDraftFacts — words, not numbers (de-gamified law)
// ─────────────────────────────────────────────────────────────────────────────

describe('summarizeDraftFacts', () => {
  it('compresses material + patina + era + mood into quiet words', () => {
    const facts = summarizeDraftFacts({
      material: { primary: 'walnut', finish: 'natural oil' },
      patina: { potential: 0.8, trajectory: 'oak silvers' },
      identity: { era: 'midcentury' },
      style: { mood_keywords: ['grounded', 'quiet', 'warm', 'extra'] },
    });
    expect(facts).toEqual([
      'walnut · natural oil',
      'high patina potential',
      'oak silvers',
      'midcentury',
      'grounded, quiet, warm',
    ]);
  });

  it('never emits raw numbers', () => {
    const facts = summarizeDraftFacts({
      material: { primary: 'steel' },
      patina: { potential: 0.55 },
    });
    expect(facts).toEqual(['steel', 'some patina potential']);
    expect(facts.join(' ')).not.toMatch(/[0-9]/);
  });

  it('skips low patina potential and handles empty drafts', () => {
    expect(summarizeDraftFacts({ patina: { potential: 0.2 } })).toEqual([]);
    expect(summarizeDraftFacts(null)).toEqual([]);
    expect(summarizeDraftFacts({})).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useProductDnaDraft
// ─────────────────────────────────────────────────────────────────────────────

describe('useProductDnaDraft', () => {
  interface QueryConfig {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
    enabled: boolean;
  }

  it('is disabled without a product id', () => {
    const config = useProductDnaDraft(null) as unknown as QueryConfig;
    expect(config.enabled).toBe(false);
    expect(config.queryKey).toEqual(['product-dna-draft', null]);
  });

  it('reads the newest draft for the product', async () => {
    const row = {
      id: 1,
      product_id: 'p-1',
      draft: { style: { spectrums: { warmth: 0.6 } } },
      model: 'dev-seed',
      prompt_version: 'v1',
      overall_confidence: 0.66,
      created_at: '2026-07-01T00:00:00Z',
    };
    const builder = setTableResult('product_dna_drafts', { data: row, error: null });

    const config = useProductDnaDraft('p-1') as unknown as QueryConfig;
    const result = await config.queryFn();

    expect(result).toEqual(row);
    const eq = builder.__chain.find((c) => c.method === 'eq');
    expect(eq?.args).toEqual(['product_id', 'p-1']);
    const order = builder.__chain.find((c) => c.method === 'order');
    expect(order?.args[0]).toBe('created_at');
    expect(order?.args[1]).toEqual({ ascending: false });
    const limit = builder.__chain.find((c) => c.method === 'limit');
    expect(limit?.args).toEqual([1]);
  });

  it('returns null when no draft exists', async () => {
    setTableResult('product_dna_drafts', { data: null, error: null });
    const config = useProductDnaDraft('p-2') as unknown as QueryConfig;
    expect(await config.queryFn()).toBeNull();
  });

  it('throws on error', async () => {
    setTableResult('product_dna_drafts', { data: null, error: new Error('rls') });
    const config = useProductDnaDraft('p-3') as unknown as QueryConfig;
    await expect(config.queryFn()).rejects.toThrow('rls');
  });
});
