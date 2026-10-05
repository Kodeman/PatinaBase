// deno test --allow-all --config supabase/functions/deno.json supabase/functions/board-deck-import-resolve/
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type Candidate, type ClaimedItem, type ResolveDeps, runResolve } from './core.ts';
import { bandLook, type KnnHit, LOOK_EMBED_BATCH, type LookDeps, lookCheckCandidate } from './look.ts';
import { LOOK_MIN_VISIBLE_VECTORS, LOOK_THRESHOLDS } from './thresholds.ts';

const IMPORT = '22222222-2222-4222-8222-222222222222';

function picture(key: string, extracted: Record<string, unknown> = {}): ClaimedItem {
  return {
    item_id: `item-${key}`,
    import_id: IMPORT,
    element_key: key,
    board_item_id: `pin-${key}`,
    slide_index: 0,
    role: 'product',
    extracted,
  };
}

/** A unit vector at an angle from the first axis: cosine to axis(0) = cos(t). */
function vec(t: number): number[] {
  return [Math.cos(t), Math.sin(t), 0];
}

interface Recorded {
  itemId: string;
  state: string;
  foundBy: string | null;
  candidates: Candidate[];
}

function fake(items: ClaimedItem[], options: {
  photoMatch?: boolean;
  visible?: number;
  healthy?: boolean;
  embed?: (inputs: { id: string; url: string }[]) => Promise<Map<string, number[]>>;
  knn?: KnnHit[];
  words?: { product_id: string; score: number }[];
  pages?: Record<string, string>;
  noLook?: boolean;
} = {}) {
  const recorded: Recorded[] = [];
  const calls: Record<string, number> = {};
  const embedBatches: number[] = [];
  const knnCategories: (string | null)[] = [];
  const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1);
  const look: LookDeps = {
    healthy: async () => {
      count('healthy');
      return options.healthy ?? true;
    },
    gate: async () => {
      count('gate');
      return { photo_match: options.photoMatch ?? true, visible_vectors: options.visible ?? 50 };
    },
    cropUrls: async (ids) => {
      count('cropUrls');
      return new Map(ids.map((id) => [id, `https://signed.example/${id}.jpg?token=x`]));
    },
    knn: async (_importId, _vector, _limit, category) => {
      count('knn');
      knnCategories.push(category);
      return options.knn ?? [];
    },
  };
  const deps: ResolveDeps = {
    claim: async () => items,
    matchLinks: async () => ({ products: [], vendors: {} }),
    matchSku: async () => [],
    searchWords: async () => options.words ?? [],
    consumeLinkQuota: async (_id, n) => n,
    fetchPage: async (url) => {
      const html = options.pages?.[url];
      if (!html) throw new Error('no page');
      return { html, finalUrl: url };
    },
    record: async (itemId, state, foundBy, candidates) => {
      recorded.push({ itemId, state, foundBy, candidates });
    },
    pairablePictures: async () => [],
    pairLink: async () => false,
    embedImages: async (inputs) => {
      count('embed');
      embedBatches.push(inputs.length);
      if (options.embed) return options.embed(inputs);
      // Crops all look along axis 0; page photos along axis 1 (disagree).
      return new Map(inputs.map((input) => [input.id, input.id.startsWith('page:') ? vec(Math.PI / 2) : vec(0)]));
    },
    claimAdjudication: async () => ({ status: 'denied' }),
    storeAdjudication: async () => {},
    adjudicate: null,
    look: options.noLook ? null : look,
    sleep: async () => {},
    log: () => {},
  };
  return { deps, recorded, calls, embedBatches, knnCategories };
}

const hits: KnnHit[] = [
  { product_id: 'catalog-a', rank: 0.95, layer: 'catalog' },
  { product_id: 'personal-b', rank: 0.9, layer: 'personal' },
  { product_id: 'studio-c', rank: 0.88, layer: 'studio' },
  { product_id: 'catalog-d', rank: 0.5, layer: 'catalog' },
];

// ── Banding (pure) ───────────────────────────────────────────────────────────

Deno.test('bandLook: a clear top hit is likely when the vector is not fused', () => {
  const out = bandLook([
    { product_id: 'a', rank: 0.9, layer: 'catalog' },
    { product_id: 'b', rank: 0.8, layer: 'catalog' },
  ], { fused: false });
  assertEquals(out.map((c) => [c.product_id, c.band]), [['a', 'likely'], ['b', 'possible']]);
  assertEquals(out[0].evidence.threshold_version, LOOK_THRESHOLDS.threshold_version);
});

Deno.test('bandLook: below tau or inside the margin is possible', () => {
  const low = bandLook([{ product_id: 'a', rank: LOOK_THRESHOLDS.likely - 0.01, layer: 'catalog' }], { fused: false });
  assertEquals(low[0].band, 'possible');
  const close = bandLook([
    { product_id: 'a', rank: 0.95, layer: 'catalog' },
    { product_id: 'b', rank: 0.95 - LOOK_THRESHOLDS.margin / 2, layer: 'catalog' },
  ], { fused: false });
  assertEquals(close.map((c) => c.band), ['possible', 'possible']);
});

Deno.test('bandLook: fused-vector hits are capped at possible; the uncapped band is kept as evidence', () => {
  const out = bandLook(hits, { fused: true });
  assert(out.every((c) => c.band === 'possible'), 'fused hits never better than possible');
  assertEquals(out.length, LOOK_THRESHOLDS.shown, 'top 3 only');
  const top = out.find((c) => c.product_id === 'catalog-a')!;
  assertEquals(top.evidence.band_uncapped, 'likely');
  assertEquals(top.evidence.fused, true);
});

Deno.test('bandLook: the designer\'s own library is ordered first; the band never moves', () => {
  const out = bandLook(hits, { fused: true });
  assertEquals(out.map((c) => c.product_id), ['personal-b', 'studio-c', 'catalog-a']);
  assert(!out.some((c) => c.product_id === 'catalog-d'), 'the 4th hit is not shown');
});

Deno.test('lookCheckCandidate: disagreement drops one band and marks look_checked', () => {
  const base = { source: 'link' as const, extracted: { source_url: 'https://s.example/p' }, band: 'strong' as const, evidence: { page_read: true } };
  const disagree = lookCheckCandidate(base, LOOK_THRESHOLDS.pageAgrees - 0.1);
  assertEquals(disagree.band, 'likely');
  assertEquals(disagree.evidence.look_checked, true);
  assertEquals(disagree.evidence.look_agrees, false);
  const agree = lookCheckCandidate(base, LOOK_THRESHOLDS.pageAgrees + 0.1);
  assertEquals(agree.band, 'strong');
  assertEquals(agree.evidence.look_checked, true);
});

// ── The run ──────────────────────────────────────────────────────────────────

Deno.test('T2: a piece with nothing strong is found by look, capped at possible, library first', async () => {
  const f = fake([picture('p1', { caption: { category: 'seating' } })], { knn: hits });
  const summary = await runResolve(f.deps);
  assertEquals(f.recorded.length, 1);
  const [row] = f.recorded;
  assertEquals(row.state, 'found');
  assertEquals(row.foundBy, 'look');
  assertEquals(row.candidates.map((c) => [c.product_id, c.source, c.band, c.rank]), [
    ['personal-b', 'look', 'possible', 1],
    ['studio-c', 'look', 'possible', 2],
    ['catalog-a', 'look', 'possible', 3],
  ]);
  assertEquals(f.knnCategories, ['seating'], 'the extraction category filters the kNN');
  assertEquals(summary.look.status, 'ran');
  assertEquals(summary.look.matched, 1);
});

Deno.test('T2: words results stay first; look hits follow', async () => {
  const f = fake([picture('p1', { caption: { name: 'Cove sofa' } })], {
    knn: hits.slice(0, 1),
    words: [{ product_id: 'words-x', score: 0.4 }],
  });
  await runResolve(f.deps);
  const [row] = f.recorded;
  assertEquals(row.foundBy, 'words');
  assertEquals(row.candidates.map((c) => c.source), ['words', 'look']);
});

Deno.test('health probe down: skip quietly, links and words recorded, status unavailable', async () => {
  const f = fake([picture('p1', { caption: { name: 'Cove sofa' } })], {
    healthy: false,
    knn: hits,
    words: [{ product_id: 'words-x', score: 0.4 }],
  });
  const summary = await runResolve(f.deps);
  assertEquals(f.calls.embed ?? 0, 0, 'no embed when the worker is down');
  assertEquals(f.calls.knn ?? 0, 0);
  assertEquals(f.recorded[0].state, 'found');
  assertEquals(f.recorded[0].foundBy, 'words');
  assertEquals(summary.look.status, 'unavailable');
});

Deno.test('not asked (flag off): no health probe, no embed, status not_asked', async () => {
  const f = fake([picture('p1')], { photoMatch: false, knn: hits });
  const summary = await runResolve(f.deps);
  assertEquals(f.calls.healthy ?? 0, 0, 'the container is never woken for an import that did not ask');
  assertEquals(f.calls.embed ?? 0, 0);
  assertEquals(f.recorded[0].state, 'not_found');
  assertEquals(summary.look.status, 'not_asked');
});

Deno.test('too few visible vectors: only the look tier is skipped', async () => {
  const f = fake([picture('p1', { caption: { name: 'Cove sofa' } })], {
    visible: LOOK_MIN_VISIBLE_VECTORS - 1,
    knn: hits,
    words: [{ product_id: 'words-x', score: 0.4 }],
  });
  const summary = await runResolve(f.deps);
  assertEquals(f.calls.knn ?? 0, 0);
  assertEquals(f.recorded[0].foundBy, 'words', 'words still ran');
  assertEquals(summary.look.status, 'unavailable');
});

Deno.test('429 after the client backoff: no attempt burned (never recorded pending)', async () => {
  const f = fake([picture('p1'), picture('p2', { caption: { name: 'Cove sofa' } })], {
    knn: hits,
    words: [{ product_id: 'words-x', score: 0.4 }],
    embed: () => Promise.reject(Object.assign(new Error('inference /embed/image at capacity (429)'), { status: 429 })),
  });
  const summary = await runResolve(f.deps);
  assertEquals(f.calls.embed, 1, 'stops after the throttled batch');
  assertEquals(f.calls.knn ?? 0, 0);
  assert(f.recorded.every((r) => r.state !== 'pending'), 'a throttle never turns a piece back to pending');
  assertEquals(f.recorded.find((r) => r.itemId === 'item-p1')!.state, 'not_found');
  assertEquals(f.recorded.find((r) => r.itemId === 'item-p2')!.foundBy, 'words');
  assertEquals(summary.look.throttled, true);
});

Deno.test('embedding is batched at 16', async () => {
  const items = Array.from({ length: 20 }, (_, i) => picture(`p${i}`));
  const f = fake(items, { knn: hits });
  await runResolve({ ...f.deps, claim: async () => items });
  assert(f.embedBatches.every((n) => n <= LOOK_EMBED_BATCH), `batches ${f.embedBatches}`);
  assertEquals(f.embedBatches.reduce((a, b) => a + b, 0), 20);
});

Deno.test('og:image look-check: a page photo that disagrees drops the link one band', async () => {
  const url = 'https://shop.example/products/cove';
  const html = '<html><head><meta property="og:type" content="product">' +
    '<meta property="og:image" content="https://cdn.shop.example/cove.jpg">' +
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Cove', offers: { price: '10' } })}</script></head></html>`;
  const f = fake([picture('p1', { links: [{ url, source: 'picture' }] })], { pages: { [url]: html }, knn: hits });
  const summary = await runResolve(f.deps);
  const [row] = f.recorded;
  const link = row.candidates.find((c) => c.source === 'link')!;
  assertEquals(link.band, 'likely', 'strong (link on the picture) → likely when the photos disagree');
  assertEquals(link.evidence.look_checked, true);
  assertEquals(link.evidence.look_agrees, false);
  assertEquals(row.foundBy, 'link');
  assertEquals(summary.look.downgraded, 1);
  // No strong candidate is left, so T2 also ran for this piece.
  assert(row.candidates.some((c) => c.source === 'look'));
});

Deno.test('og:image look-check: agreement keeps the band and marks look_checked', async () => {
  const url = 'https://shop.example/products/cove';
  const html = '<html><head><meta property="og:type" content="product">' +
    '<meta property="og:image" content="https://cdn.shop.example/cove.jpg">' +
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Cove', offers: { price: '10' } })}</script></head></html>`;
  const f = fake([picture('p1', { links: [{ url, source: 'picture' }] })], {
    pages: { [url]: html },
    knn: hits,
    embed: async (inputs) => new Map(inputs.map((input) => [input.id, vec(0)])),
  });
  await runResolve(f.deps);
  const [row] = f.recorded;
  assertEquals(row.candidates.map((c) => c.source), ['link'], 'strong link stands; no look tier');
  assertEquals(row.candidates[0].band, 'strong');
  assertEquals(row.candidates[0].evidence.look_checked, true);
  assertEquals(f.calls.knn ?? 0, 0);
});

Deno.test('no look deps: the run is links and words only', async () => {
  const f = fake([picture('p1')], { noLook: true, knn: hits });
  const summary = await runResolve(f.deps);
  assertEquals(f.calls.embed ?? 0, 0);
  assertEquals(f.recorded[0].state, 'not_found');
  assertEquals(summary.look.status, 'not_asked');
});
