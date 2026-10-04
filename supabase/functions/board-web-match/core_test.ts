// deno test --allow-all --config supabase/functions/deno.json supabase/functions/board-web-match/
// deno-lint-ignore-file no-explicit-any no-import-prefix
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type Budget,
  FetchBlocked,
  gate,
  mergeCandidates,
  pagesFromVision,
  readItemIds,
  responseFor,
  runWebMatch,
  type WebMatchDeps,
  type WebMatchItem,
} from './core.ts';

const VENDORS = new Map([['fourhands.com', 'Four Hands']]);

const LD_PAGE = (name: string, price: string) => `<html><head>
<title>${name} | Shop</title>
<script type="application/ld+json">{"@type":"Product","name":"${name}","brand":{"name":"Maker"},
"image":"https://cdn.example/${encodeURIComponent(name)}.jpg","offers":{"price":"${price}","priceCurrency":"USD"}}</script>
</head></html>`;

const OG_ONLY_PAGE = `<html><head><meta property="og:type" content="product">
<meta property="og:title" content="Cove sofa"><meta property="product:price:amount" content="2499">
<meta property="product:price:currency" content="USD"></head></html>`;

/** A Vision Web Detection response: pages, full/partial matches, similar images. */
function vision(pages: Array<{ url: string; title?: string; full?: boolean; partial?: boolean }>) {
  return {
    responses: [{
      webDetection: {
        pagesWithMatchingImages: pages.map((page) => ({
          url: page.url,
          pageTitle: page.title ?? '',
          ...(page.full ? { fullMatchingImages: [{ url: `${page.url}/img.jpg` }] } : {}),
          ...(page.partial ? { partialMatchingImages: [{ url: `${page.url}/img2.jpg` }] } : {}),
        })),
        visuallySimilarImages: [{ url: 'https://www.westelm.com/similar.jpg' }],
      },
    }],
  };
}

function item(id: string, extra: Partial<WebMatchItem> = {}): WebMatchItem {
  return {
    item_id: id,
    import_id: 'import-1',
    state: 'not_found',
    candidates: [],
    crop_path: `studio/boards/b/${id}.jpg`,
    ...extra,
  };
}

interface Harness {
  deps: WebMatchDeps;
  calls: { budget: number[]; annotate: number; pages: string[]; records: Array<{ id: string; candidates: any[]; base: any[] }> };
}

function harness(options: {
  budget?: Budget;
  response?: unknown;
  pages?: Record<string, string | Error>;
  applied?: boolean;
} = {}): Harness {
  const calls: Harness['calls'] = { budget: [], annotate: 0, pages: [], records: [] };
  const deps: WebMatchDeps = {
    consumeBudget: (n) => {
      calls.budget.push(n);
      return Promise.resolve(options.budget ?? { granted: n, resets_at: '2026-11-01T00:00:00+00:00' });
    },
    loadCrop: () => Promise.resolve('Y3JvcA=='),
    annotate: () => {
      calls.annotate++;
      return Promise.resolve(options.response ?? vision([]));
    },
    fetchPage: (url) => {
      calls.pages.push(url);
      const page = options.pages?.[url];
      if (page instanceof Error) return Promise.reject(page);
      if (page == null) return Promise.reject(new FetchBlocked('fetch_failed', false));
      return Promise.resolve({ html: page, finalUrl: url });
    },
    record: (id, candidates, base) => {
      calls.records.push({ id, candidates, base });
      return Promise.resolve(options.applied ?? true);
    },
    vendorDomains: VENDORS,
    sleep: () => Promise.resolve(),
    log: () => {},
  };
  return { deps, calls };
}

// ── Domain filtering ─────────────────────────────────────────────────────────

Deno.test('pagesFromVision keeps only retailer and studio-vendor pages', () => {
  const pages = pagesFromVision(vision([
    { url: 'https://www.pinterest.com/pin/123', full: true },
    { url: 'https://someblog.example/living-room-tour', full: true },
    { url: 'https://www.westelm.com/products/harmony-sofa', partial: true },
    { url: 'https://shop.fourhands.com/cove-sofa', full: true },
    { url: 'https://www.cb2.com/no-match-images' },
  ]), VENDORS);
  assertEquals(pages.map((p) => [p.url, p.shop, p.match]), [
    ['https://shop.fourhands.com/cove-sofa', 'Four Hands', 'full'],
    ['https://www.westelm.com/products/harmony-sofa', 'West Elm', 'partial'],
  ]);
});

Deno.test('pagesFromVision reads at most four pages, full matches first, deduped', () => {
  const pages = pagesFromVision(vision([
    { url: 'https://www.cb2.com/a', partial: true },
    { url: 'https://www.cb2.com/b', partial: true },
    { url: 'https://www.wayfair.com/c', full: true },
    { url: 'https://www.wayfair.com/c?utm_source=x', full: true },
    { url: 'https://www.article.com/d', full: true },
    { url: 'https://www.ikea.com/e', partial: true },
  ]), VENDORS);
  assertEquals(pages.map((p) => p.url), [
    'https://www.wayfair.com/c',
    'https://www.article.com/d',
    'https://www.cb2.com/a',
    'https://www.cb2.com/b',
  ]);
});

Deno.test('pagesFromVision surfaces a Vision error', () => {
  let threw = false;
  try {
    pagesFromVision({ responses: [{ error: { code: 7, message: 'quota' } }] }, VENDORS);
  } catch {
    threw = true;
  }
  assert(threw);
});

// ── Banding and JSON-LD ──────────────────────────────────────────────────────

Deno.test('full match is likely, partial is possible, similar is never shown, nothing is strong', async () => {
  const { deps, calls } = harness({
    response: vision([
      { url: 'https://www.westelm.com/products/harmony-sofa', partial: true },
      { url: 'https://www.wayfair.com/cove-sofa', full: true },
    ]),
    pages: {
      'https://www.westelm.com/products/harmony-sofa': LD_PAGE('Harmony sofa', '1899'),
      'https://www.wayfair.com/cove-sofa': LD_PAGE('Cove sofa', '2499'),
    },
  });
  const result = await runWebMatch([item('a')], deps);
  assertEquals(result.results[0].status, 'found');
  const [record] = calls.records;
  assertEquals(record.base, []);
  assertEquals(record.candidates.map((c) => [c.source, c.band, c.rank, c.extracted.name]), [
    ['web', 'likely', 1, 'Cove sofa'],
    ['web', 'possible', 2, 'Harmony sofa'],
  ]);
  assertEquals(record.candidates[0].extracted.price_cents, 249900);
  assert(!JSON.stringify(record.candidates).includes('similar.jpg'));
  assert(record.candidates.every((c) => c.band !== 'strong'));
});

Deno.test('a page read without JSON-LD Product is rejected', async () => {
  const { deps, calls } = harness({
    response: vision([{ url: 'https://www.wayfair.com/cove-sofa', full: true }]),
    pages: { 'https://www.wayfair.com/cove-sofa': OG_ONLY_PAGE },
  });
  const result = await runWebMatch([item('a')], deps);
  assertEquals(calls.pages, ['https://www.wayfair.com/cove-sofa']);
  assertEquals(result.results[0].status, 'none');
  assertEquals(calls.records.length, 0);
});

Deno.test('a bot-walled page is link-only: shop from the domain, title name, no price, possible', async () => {
  const { deps, calls } = harness({
    response: vision([{ url: 'https://www.rh.com/catalog/product/prod123', title: '<b>Cloud</b> Sofa | RH', full: true }]),
  });
  await runWebMatch([item('a')], deps);
  const [candidate] = calls.records[0].candidates;
  assertEquals(candidate.band, 'possible');
  assertEquals(candidate.extracted, {
    name: 'Cloud Sofa',
    brand: 'Restoration Hardware',
    source_url: 'https://www.rh.com/catalog/product/prod123',
  });
  assertEquals(candidate.evidence.page_read, false);
});

Deno.test('an unsafe page address is no candidate', async () => {
  const { deps, calls } = harness({
    response: vision([{ url: 'https://www.wayfair.com/x', full: true }]),
    pages: { 'https://www.wayfair.com/x': new FetchBlocked('blocked_address', true) },
  });
  const result = await runWebMatch([item('a')], deps);
  assertEquals(result.results[0].status, 'none');
  assertEquals(calls.records.length, 0);
});

// ── Appending ────────────────────────────────────────────────────────────────

Deno.test('web rows append after existing candidates, send the base for the append check, cap at five', async () => {
  const existing = [
    { source: 'words', product_id: '11111111-1111-4111-8111-111111111111', band: 'possible', rank: 1, evidence: {} },
    { source: 'link', extracted: { source_url: 'https://www.wayfair.com/cove-sofa' }, band: 'likely', rank: 2, evidence: {} },
    { source: 'words', product_id: '22222222-2222-4222-8222-222222222222', band: 'possible', rank: 3, evidence: {} },
    { source: 'words', product_id: '33333333-3333-4333-8333-333333333333', band: 'possible', rank: 4, evidence: {} },
  ];
  const { deps, calls } = harness({
    response: vision([
      { url: 'https://www.wayfair.com/cove-sofa', full: true },
      { url: 'https://www.cb2.com/other', partial: true },
      { url: 'https://www.article.com/third', partial: true },
    ]),
    pages: {
      'https://www.wayfair.com/cove-sofa': LD_PAGE('Cove sofa', '2499'),
      'https://www.cb2.com/other': LD_PAGE('Other', '100'),
      'https://www.article.com/third': LD_PAGE('Third', '200'),
    },
  });
  const result = await runWebMatch([item('a', { state: 'found', candidates: existing })], deps);
  const [record] = calls.records;
  assertEquals(record.base, existing);
  assertEquals(record.candidates.length, 5);
  assertEquals(record.candidates.slice(0, 4), existing);
  assertEquals(record.candidates[4].rank, 5);
  assertEquals(record.candidates[4].source, 'web');
  assertEquals(result.results[0].added, 1);
});

Deno.test('a piece that moved on while searching is skipped, not overwritten', async () => {
  const { deps } = harness({
    applied: false,
    response: vision([{ url: 'https://www.wayfair.com/cove-sofa', full: true }]),
    pages: { 'https://www.wayfair.com/cove-sofa': LD_PAGE('Cove sofa', '2499') },
  });
  const result = await runWebMatch([item('a')], deps);
  assertEquals(result.results[0], { item_id: 'a', status: 'skipped', added: 0, reason: 'changed' });
});

Deno.test('mergeCandidates returns null when nothing new fits', () => {
  assertEquals(mergeCandidates([], []), null);
});

// ── Budget before Google ─────────────────────────────────────────────────────

Deno.test('cap reached: the budget is consumed first and Google is never called', async () => {
  const { deps, calls } = harness({ budget: { granted: 0, resets_at: '2026-11-01T00:00:00+00:00' } });
  const result = await runWebMatch([item('a'), item('b')], deps);
  assertEquals(calls.budget, [2]);
  assertEquals(calls.annotate, 0);
  assertEquals(calls.pages.length, 0);
  assertEquals(result.results.map((r) => r.status), ['cap_reached', 'cap_reached']);
  const response = responseFor(result);
  assertEquals(response.status, 429);
  assertEquals(await response.json(), { code: 'cap_reached', resets_at: '2026-11-01T00:00:00+00:00' });
});

Deno.test('a partial grant calls Google only for the granted pieces', async () => {
  const { deps, calls } = harness({ budget: { granted: 1, resets_at: '2026-11-01T00:00:00+00:00' } });
  const result = await runWebMatch([item('a'), item('b')], deps);
  assertEquals(calls.annotate, 1);
  assertEquals(result.results.map((r) => r.status), ['none', 'cap_reached']);
  assertEquals(responseFor(result).status, 200);
});

Deno.test('ineligible pieces consume no budget', async () => {
  const { deps, calls } = harness();
  const result = await runWebMatch([
    item('kept', { state: 'kept' }),
    item('pending', { state: 'pending' }),
    item('nopic', { crop_path: null }),
  ], deps);
  assertEquals(calls.budget, []);
  assertEquals(calls.annotate, 0);
  assertEquals(result.results.map((r) => r.reason), ['state_kept', 'state_pending', 'no_picture']);
});

// ── HTTP edges ───────────────────────────────────────────────────────────────

Deno.test('no key: POST is 503 no_key and the probe says disabled', async () => {
  const post = gate(new Request('http://x/board-web-match', { method: 'POST', body: '{}' }), undefined);
  assertEquals(post?.status, 503);
  assertEquals(await post?.json(), { code: 'no_key' });
  const probe = gate(new Request('http://x/board-web-match?probe=1'), undefined);
  assertEquals(await probe?.json(), { enabled: false });
  const live = gate(new Request('http://x/board-web-match?probe=1'), 'key');
  assertEquals(await live?.json(), { enabled: true });
  assertEquals(gate(new Request('http://x/board-web-match', { method: 'POST', body: '{}' }), 'key'), null);
});

Deno.test('item_ids: 1..20 distinct uuids', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assertEquals(readItemIds({ item_ids: [id, id.toUpperCase()] }), [id]);
  assertEquals(readItemIds({ item_ids: [] }), null);
  assertEquals(readItemIds({ item_ids: ['nope'] }), null);
  const many = Array.from({ length: 21 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`);
  assertEquals(readItemIds({ item_ids: many }), null);
});
