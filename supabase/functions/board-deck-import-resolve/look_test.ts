// deno test --allow-all --config supabase/functions/deno.json supabase/functions/board-deck-import-resolve/
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type Candidate, type ClaimedItem, type ResolveDeps, runResolve } from './core.ts';
import {
  bandExact,
  bandImageFirst,
  bandLook,
  type KnnHit,
  LOOK_EMBED_BATCH,
  type LookDeps,
  lookCheckCandidate,
  type PhashHit,
} from './look.ts';
import type { CropSignature } from './phash.ts';
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
  imageKnn?: KnnHit[];
  phash?: PhashHit[];
  signature?: CropSignature | null;
  suppressed?: Record<string, string[]>;
  words?: { product_id: string; score: number }[];
  pages?: Record<string, string>;
  noLook?: boolean;
} = {}) {
  const recorded: Recorded[] = [];
  const calls: Record<string, number> = {};
  const embedBatches: number[] = [];
  const knnCategories: (string | null)[] = [];
  const stored: { itemId: string; crop: CropSignature & { vector: number[] } }[] = [];
  const phashAsked: { phash: string; maxDistance: number }[] = [];
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
    imageKnn: async () => {
      count('imageKnn');
      return options.imageKnn ?? [];
    },
    phashMatch: async (_importId, phash, maxDistance) => {
      count('phashMatch');
      phashAsked.push({ phash, maxDistance });
      return options.phash ?? [];
    },
    cropSignature: async () => {
      count('cropSignature');
      return options.signature === undefined ? { image_hash: 'a'.repeat(64), phash: null } : options.signature;
    },
    storeCrop: async (itemId, crop) => {
      stored.push({ itemId, crop });
    },
    suppressed: async (ids) =>
      new Map(ids.filter((id) => options.suppressed?.[id]).map((id) => [id, new Set(options.suppressed![id])])),
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
    release: async () => {},
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
  return { deps, recorded, calls, embedBatches, knnCategories, stored, phashAsked };
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

Deno.test('past the start budget: no probe, no embed; pieces recorded as they stand', async () => {
  let clock = 0;
  const f = fake([picture('p1', { caption: { name: 'Cove sofa' } })], { knn: hits });
  const summary = await runResolve({
    ...f.deps,
    now: () => clock,
    searchWords: async () => {
      clock = 10 * 60_000; // the words tier ran long
      return [{ product_id: 'words-x', score: 0.4 }];
    },
  });
  assertEquals(f.calls.healthy ?? 0, 0);
  assertEquals(f.calls.embed ?? 0, 0);
  assertEquals(f.recorded[0].foundBy, 'words');
  assertEquals(summary.look.status, 'unavailable');
});

Deno.test('no look deps: the run is links and words only', async () => {
  const f = fake([picture('p1')], { noLook: true, knn: hits });
  const summary = await runResolve(f.deps);
  assertEquals(f.calls.embed ?? 0, 0);
  assertEquals(f.recorded[0].state, 'not_found');
  assertEquals(summary.look.status, 'not_asked');
});

// ── W5: T1 exact, image-first T2, taught signal, suppression ─────────────────

Deno.test('bandExact: dHash within τ_hamming or cosine at τ_exact is strong; nothing else is', () => {
  const out = bandExact(
    [
      { product_id: 'cos', rank: LOOK_THRESHOLDS.exact, layer: 'catalog', source: 'product_image' },
      { product_id: 'near', rank: LOOK_THRESHOLDS.exact - 0.01, layer: 'catalog', source: 'product_image' },
    ],
    [
      { product_id: 'hash', distance: LOOK_THRESHOLDS.exactHamming, layer: 'studio', source: 'designer_confirmed' },
      { product_id: 'far', distance: LOOK_THRESHOLDS.exactHamming + 1, layer: 'catalog', source: 'designer_confirmed' },
    ],
  );
  assertEquals(out.map((c) => [c.product_id, c.band, c.source]), [['hash', 'strong', 'look'], ['cos', 'strong', 'look']]);
  assertEquals(out[0].evidence.tier, 'exact');
  assertEquals(out[0].evidence.phash_distance, LOOK_THRESHOLDS.exactHamming);
  assertEquals(out[0].evidence.image_source, 'designer_confirmed');
  assertEquals(out[1].evidence.similarity, LOOK_THRESHOLDS.exact);
  assert(LOOK_THRESHOLDS.exact < 0.99, 'τ_exact stays clear of int8 drift near 1.0');
});

Deno.test('bandImageFirst: picture hits are uncapped; fused hits only for products with no picture hit, capped', () => {
  const out = bandImageFirst(
    [{ product_id: 'a', rank: 0.9, layer: 'catalog', source: 'product_image' }],
    [{ product_id: 'a', rank: 0.97, layer: 'catalog' }, { product_id: 'b', rank: 0.96, layer: 'catalog' }],
  );
  assertEquals(out.map((c) => [c.product_id, c.band, c.evidence.fused]), [['a', 'likely', false], ['b', 'possible', true]]);
});

Deno.test('T1 exact by image cosine: strong, found by look, the fused twin is never asked', async () => {
  const f = fake([picture('p1')], {
    imageKnn: [{ product_id: 'catalog-a', rank: 0.97, layer: 'catalog', source: 'product_image' }],
    knn: hits,
  });
  const summary = await runResolve(f.deps);
  const [row] = f.recorded;
  assertEquals(row.foundBy, 'look');
  assertEquals(row.candidates.map((c) => [c.product_id, c.band, c.rank]), [['catalog-a', 'strong', 1]]);
  assertEquals(row.candidates[0].evidence.tier, 'exact');
  assertEquals(f.calls.knn ?? 0, 0);
  assertEquals(f.calls.phashMatch ?? 0, 0, 'no phash (not WebP) → no hash lookup');
  assertEquals(summary.look.exact, 1);
  assertEquals(summary.look.matched, 0);
});

Deno.test('T1 exact by dHash: the crop hash is looked up within τ_hamming', async () => {
  const f = fake([picture('p1')], {
    signature: { image_hash: 'b'.repeat(64), phash: '-4358495415582126305' },
    phash: [{ product_id: 'studio-c', distance: 3, layer: 'studio', source: 'designer_confirmed' }],
    imageKnn: [{ product_id: 'catalog-a', rank: 0.7, layer: 'catalog', source: 'product_image' }],
  });
  await runResolve(f.deps);
  assertEquals(f.phashAsked, [{ phash: '-4358495415582126305', maxDistance: LOOK_THRESHOLDS.exactHamming }]);
  assertEquals(f.recorded[0].candidates.map((c) => [c.product_id, c.band]), [['studio-c', 'strong']]);
  assertEquals(f.recorded[0].candidates[0].evidence.phash_distance, 3);
});

Deno.test('T2 prefers picture vectors: a product with picture rows is uncapped, others fall back to fused', async () => {
  const f = fake([picture('p1')], {
    imageKnn: [{ product_id: 'catalog-a', rank: 0.9, layer: 'catalog', source: 'product_image' }],
    knn: [{ product_id: 'catalog-a', rank: 0.6, layer: 'catalog' }, { product_id: 'catalog-d', rank: 0.55, layer: 'catalog' }],
  });
  const summary = await runResolve(f.deps);
  assertEquals(f.recorded[0].candidates.map((c) => [c.product_id, c.band, c.evidence.fused]), [
    ['catalog-a', 'likely', false],
    ['catalog-d', 'possible', true],
  ]);
  assertEquals(summary.look.matched, 1);
});

Deno.test('every embedded crop keeps its signature for a later Keep', async () => {
  const f = fake([picture('p1'), picture('p2')], {
    signature: { image_hash: 'c'.repeat(64), phash: '42' },
  });
  await runResolve(f.deps);
  assertEquals(f.stored.map((s) => [s.itemId, s.crop.image_hash, s.crop.phash, s.crop.vector]), [
    ['item-p1', 'c'.repeat(64), '42', vec(0)],
    ['item-p2', 'c'.repeat(64), '42', vec(0)],
  ]);
});

Deno.test('a product the designer swapped away from never returns from T1 or T2', async () => {
  const f = fake([picture('p1')], {
    signature: { image_hash: 'd'.repeat(64), phash: '7' },
    suppressed: { 'item-p1': ['catalog-a', 'studio-c'] },
    phash: [{ product_id: 'studio-c', distance: 0, layer: 'studio', source: 'designer_confirmed' }],
    imageKnn: [{ product_id: 'catalog-a', rank: 0.99, layer: 'catalog', source: 'product_image' }],
    knn: hits,
  });
  await runResolve(f.deps);
  const ids = f.recorded[0].candidates.map((c) => c.product_id);
  assert(!ids.includes('catalog-a') && !ids.includes('studio-c'), `suppressed products skipped: ${ids}`);
  assertEquals(f.recorded[0].candidates.every((c) => c.band === 'possible'), true, 'no exact hit is left');
});
