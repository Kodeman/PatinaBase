// deno test --allow-all --config supabase/functions/deno.json supabase/functions/board-deck-import-resolve/
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type AdjudicationAssignment,
  type AdjudicationClaim,
  type Candidate,
  type ClaimedItem,
  FetchBlocked,
  finalizeCandidates,
  readCaption,
  readLinks,
  type ResolveDeps,
  runResolve,
} from './core.ts';
import { isDeniedLink, nameFromSlug, normalizeProductUrl } from './links.ts';

const IMPORT = '11111111-1111-4111-8111-111111111111';

function item(key: string, extracted: Record<string, unknown>, extra: Partial<ClaimedItem> = {}): ClaimedItem {
  return {
    item_id: `item-${key}`,
    import_id: IMPORT,
    element_key: key,
    board_item_id: `pin-${key}`,
    slide_index: 1,
    role: 'product',
    extracted,
    ...extra,
  };
}

function productHtml(name: string, price: string, image = 'https://cdn.shop.example/img/sofa.jpg'): string {
  return `<html><head><meta property="og:type" content="product"><meta property="og:image" content="${image}">` +
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name,
      offers: { price, priceCurrency: 'USD' },
    })}</script></head></html>`;
}

interface Recorded {
  itemId: string;
  state: string;
  foundBy: string | null;
  candidates: Candidate[];
}

interface Fake {
  deps: ResolveDeps;
  recorded: Recorded[];
  fetched: string[];
  calls: Record<string, number>;
  paired: { link: string; picture: string; candidates: Candidate[] }[];
  peakPerHost: Map<string, number>;
}

function fake(items: ClaimedItem[], overrides: Partial<ResolveDeps> & {
  pages?: Record<string, string | FetchBlocked>;
  library?: Record<string, string>;
  skus?: Record<string, string>;
  words?: Record<string, { product_id: string; score: number }[]>;
  quota?: number;
  adjudicationStore?: Map<number, AdjudicationAssignment[] | null>;
} = {}): Fake {
  const recorded: Recorded[] = [];
  const fetched: string[] = [];
  const calls: Record<string, number> = {};
  const paired: Fake['paired'] = [];
  const inflight = new Map<string, number>();
  const peakPerHost = new Map<string, number>();
  let quota = overrides.quota ?? 300;
  const store = overrides.adjudicationStore ?? new Map<number, AdjudicationAssignment[] | null>();
  const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1);

  const deps: ResolveDeps = {
    claim: async () => {
      count('claim');
      return items;
    },
    matchLinks: async (_importId, urls) => {
      count('matchLinks');
      const products = urls
        .filter((u) => overrides.library?.[u])
        .map((u) => ({ product_id: overrides.library![u], url: u }));
      return { products, vendors: { 'blocked.example': 'Blocked Home' } };
    },
    matchSku: async (_importId, sku) => {
      count('matchSku');
      if (sku === 'EXPLODE') throw new Error('db down');
      return overrides.skus?.[sku] ? [{ product_id: overrides.skus[sku] }] : [];
    },
    searchWords: async (_importId, query) => {
      count('searchWords');
      return overrides.words?.[query] ?? [];
    },
    consumeLinkQuota: async (_importId, n) => {
      count('consumeLinkQuota');
      const granted = Math.min(n, quota);
      quota -= granted;
      return granted;
    },
    fetchPage: async (url) => {
      count('fetchPage');
      fetched.push(url);
      const host = new URL(url).hostname;
      inflight.set(host, (inflight.get(host) ?? 0) + 1);
      peakPerHost.set(host, Math.max(peakPerHost.get(host) ?? 0, inflight.get(host)!));
      await new Promise((resolve) => setTimeout(resolve, 5));
      inflight.set(host, inflight.get(host)! - 1);
      const page = overrides.pages?.[url];
      if (page instanceof FetchBlocked) throw page;
      if (page == null) throw new FetchBlocked('fetch_failed', false);
      return { html: page, finalUrl: url };
    },
    record: async (itemId, state, foundBy, candidates) => {
      count('record');
      recorded.push({ itemId, state, foundBy, candidates });
    },
    pairablePictures: async () => [],
    pairLink: async (link, picture, candidates) => {
      paired.push({ link, picture, candidates });
      return true;
    },
    embedImages: null,
    claimAdjudication: async (_importId, slideIndex): Promise<AdjudicationClaim> => {
      count('claimAdjudication');
      const held = store.get(slideIndex);
      if (held) return { status: 'cached', assignments: held };
      if (store.has(slideIndex)) return { status: 'denied' };
      store.set(slideIndex, null);
      return { status: 'granted' };
    },
    storeAdjudication: async (_importId, slideIndex, assignments) => {
      count('storeAdjudication');
      store.set(slideIndex, assignments);
    },
    adjudicate: null,
    sleep: async () => {},
    log: () => {},
    ...overrides,
  };
  return { deps, recorded, fetched, calls, paired, peakPerHost };
}

function recordFor(f: Fake, key: string): Recorded {
  const hit = f.recorded.find((r) => r.itemId === `item-${key}`);
  assert(hit, `no record for ${key}`);
  return hit;
}

// ─── Links ───────────────────────────────────────────────────────────────────

Deno.test('normalizeProductUrl: lowercase host, no www, no tracking params, no trailing slash', () => {
  assertEquals(
    normalizeProductUrl('HTTP://WWW.Shop.Example/Products/Sofa/?utm_source=x&color=blue&gclid=1&ref=pin#top'),
    'https://shop.example/Products/Sofa?color=blue',
  );
  assertEquals(normalizeProductUrl('https://shop.example/'), 'https://shop.example/');
  assertEquals(normalizeProductUrl('https://shop.example'), 'https://shop.example/');
  assertEquals(normalizeProductUrl('mailto:a@b.c'), null);
  assertEquals(normalizeProductUrl('javascript:alert(1)'), null);
});

Deno.test('isDeniedLink: licence, stock and search hosts are never read', () => {
  assert(isDeniedLink('https://creativecommons.org/licenses/by/4.0/'));
  assert(isDeniedLink('https://images.unsplash.com/photo-1'));
  assert(isDeniedLink('https://www.google.com/search?q=sofa'));
  assert(isDeniedLink('ftp://shop.example/x'));
  assert(!isDeniedLink('https://shop.example/products/sofa'));
});

Deno.test('nameFromSlug: words from the last meaningful path segment', () => {
  assertEquals(nameFromSlug('https://www.example.com/products/harmony-sofa-h3434/'), 'Harmony sofa');
  assertEquals(nameFromSlug('https://www.example.com/p/12345678'), null);
  assertEquals(nameFromSlug('https://shop.example/catalog/oak_side_table.html'), 'Oak side table');
});

Deno.test('readLinks / readCaption accept the 00676 fixture shape (origin key, string caption)', () => {
  const extracted = {
    caption: 'Cove sofa',
    links: [
      { url: 'https://maker.example/rug', source: 'text' },
      { url: 'https://maker.example/sofa', origin: 'picture' },
    ],
  };
  assertEquals(readLinks(extracted).map((l) => [l.url, l.onPicture]), [
    ['https://maker.example/sofa', true],
    ['https://maker.example/rug', false],
  ]);
  assertEquals(readCaption(extracted).text, 'Cove sofa');
  assertEquals(readCaption({ caption: { name: 'Oslo', vendor: 'West Elm', sku: 'X1' } }).vendor, 'West Elm');
});

// ─── Tiers and banding ───────────────────────────────────────────────────────

Deno.test('tier banding: T0a strong, T0b on-picture strong / nearby likely, T0c strong, T1 likely', async () => {
  const f = fake([
    item('existing', { links: [{ url: 'https://shop.example/products/known?utm_source=deck', on_picture: true }] }),
    item('onpic', { links: [{ url: 'https://shop.example/products/sofa', source: 'picture' }] }),
    item('near', { links: [{ url: 'https://shop.example/products/chair', source: 'text' }] }),
    item('sku', { caption: { sku: 'AB-12', vendor: 'Example Home' } }),
    item('words', { caption: { name: 'Oak side table' } }),
  ], {
    library: { 'https://shop.example/products/known': 'prod-known' },
    pages: {
      'https://shop.example/products/sofa': productHtml('Harmony Sofa', '1999.00'),
      'https://shop.example/products/chair': productHtml('Arm Chair', '450.00'),
    },
    skus: { 'AB-12': 'prod-sku' },
    words: { 'Oak side table': [{ product_id: 'prod-words', score: 0.82 }, { product_id: 'prod-w2', score: 0.4 }] },
  });
  const summary = await runResolve(f.deps);

  const existing = recordFor(f, 'existing');
  assertEquals(existing.candidates[0].source, 'link_existing');
  assertEquals(existing.candidates[0].band, 'strong');
  assertEquals(existing.foundBy, 'link');
  assert(!f.fetched.includes('https://shop.example/products/known?utm_source=deck'), 'T0a hit must not read the page');

  const onpic = recordFor(f, 'onpic');
  assertEquals(onpic.candidates[0].band, 'strong');
  assertEquals(onpic.candidates[0].extracted?.name, 'Harmony Sofa');
  assertEquals(onpic.candidates[0].extracted?.price_cents, 199900);
  assertEquals(onpic.candidates[0].evidence.page_read, true);
  assertEquals(onpic.candidates[0].evidence.look_checked, false);

  assertEquals(recordFor(f, 'near').candidates[0].band, 'likely');

  const sku = recordFor(f, 'sku');
  assertEquals(sku.candidates[0], { source: 'sku', product_id: 'prod-sku', band: 'strong', evidence: { sku: 'AB-12' }, rank: 1 });

  const words = recordFor(f, 'words');
  assertEquals(words.foundBy, 'words');
  assertEquals(words.candidates.map((c) => [c.product_id, c.band]), [['prod-words', 'likely'], ['prod-w2', 'possible']]);
  assertEquals(summary.found, 5);
});

Deno.test('a non-product page gives no candidate; a strong hit skips T1 words', async () => {
  const f = fake([
    item('notproduct', { links: [{ url: 'https://shop.example/about-us', on_picture: true }] }),
    item('strongsku', { caption: { sku: 'S1', vendor: 'V', name: 'Sofa' } }),
  ], {
    pages: { 'https://shop.example/about-us': '<html><head><meta property="og:type" content="website"></head></html>' },
    skus: { S1: 'prod-s1' },
    words: { 'Sofa V': [{ product_id: 'prod-other', score: 0.9 }] },
  });
  await runResolve(f.deps);
  const none = recordFor(f, 'notproduct');
  assertEquals(none.state, 'not_found');
  assertEquals(none.candidates, []);
  assertEquals(recordFor(f, 'strongsku').candidates.map((c) => c.product_id), ['prod-s1']);
});

// ─── Link-only, quota and SSRF ───────────────────────────────────────────────

Deno.test('blocked page: link-only, likely, page_read=false, vendor from the domain, no fabricated price', async () => {
  const f = fake([
    item('blocked', { links: [{ url: 'https://www.blocked.example/products/harmony-sofa-h3434/', on_picture: true }] }),
    item('walled', {
      links: [{ url: 'https://www.westelm.com/products/oslo-chair-h1/', on_picture: true }],
      caption: { name: 'Oslo chair', price: '$899' },
    }),
  ], {
    pages: { 'https://www.westelm.com/products/oslo-chair-h1/': new FetchBlocked('fetch_failed', false) },
  });
  const summary = await runResolve(f.deps);
  const blocked = recordFor(f, 'blocked').candidates[0];
  assertEquals(blocked.source, 'link');
  assertEquals(blocked.band, 'likely');
  assertEquals(blocked.evidence.page_read, false);
  assertEquals(blocked.extracted?.name, 'Harmony sofa');
  assertEquals(blocked.extracted?.brand, 'Blocked Home');
  assertEquals('price_cents' in (blocked.extracted ?? {}), false);

  const walled = recordFor(f, 'walled').candidates[0];
  assertEquals(walled.extracted?.name, 'Oslo chair');
  assertEquals(walled.extracted?.brand, 'West Elm');
  assertEquals(walled.extracted?.price_cents, 89900);
  assertEquals(summary.link_only, 2);
});

Deno.test('quota denial: no page is read, the piece resolves link-only with reason quota', async () => {
  const f = fake([
    item('q1', { links: [{ url: 'https://shop.example/products/sofa', on_picture: true }] }),
  ], { quota: 0, pages: { 'https://shop.example/products/sofa': productHtml('Sofa', '10') } });
  const summary = await runResolve(f.deps);
  assertEquals(f.calls.fetchPage ?? 0, 0);
  const c = recordFor(f, 'q1').candidates[0];
  assertEquals(c.evidence.reason, 'quota');
  assertEquals(c.evidence.page_read, false);
  assertEquals(summary.quota_denied, 1);
});

Deno.test('SSRF per URL: an unsafe address gives no candidate; a safe sibling still resolves', async () => {
  const f = fake([
    item('unsafe', { links: [{ url: 'http://169.254.169.254/latest/meta-data', on_picture: true }] }),
    item('safe', { links: [{ url: 'https://shop.example/products/sofa', on_picture: true }] }),
  ], {
    pages: {
      'http://169.254.169.254/latest/meta-data': new FetchBlocked('blocked_host', true),
      'https://shop.example/products/sofa': productHtml('Sofa', '100'),
    },
  });
  await runResolve(f.deps);
  assertEquals(recordFor(f, 'unsafe').state, 'not_found');
  assertEquals(recordFor(f, 'unsafe').candidates, []);
  assertEquals(recordFor(f, 'safe').state, 'found');
});

Deno.test('denied links are ignored: no quota spent, no fetch', async () => {
  const f = fake([item('cc', { links: [{ url: 'https://creativecommons.org/licenses/by/2.0/', on_picture: true }] })]);
  await runResolve(f.deps);
  assertEquals(f.calls.consumeLinkQuota ?? 0, 0);
  assertEquals(f.calls.fetchPage ?? 0, 0);
  assertEquals(recordFor(f, 'cc').state, 'not_found');
});

Deno.test('mixed success and failure: a failing tier parks only its piece as pending', async () => {
  const f = fake([
    item('ok', { caption: { sku: 'AB-12', vendor: 'V' } }),
    item('boom', { caption: { sku: 'EXPLODE', vendor: 'V' } }),
  ], { skus: { 'AB-12': 'prod-ok' } });
  const summary = await runResolve(f.deps);
  assertEquals(recordFor(f, 'ok').state, 'found');
  assertEquals(recordFor(f, 'boom').state, 'pending');
  assertEquals(summary.found, 1);
  assertEquals(summary.retried, 1);
});

Deno.test('per-host politeness: never more than 2 requests in flight to one host', async () => {
  const pages: Record<string, string> = {};
  const items = Array.from({ length: 8 }, (_, i) => {
    const url = `https://busy.example/products/item-${i}`;
    pages[url] = productHtml(`Item ${i}`, '10');
    return item(`h${i}`, { links: [{ url, on_picture: true }] });
  });
  const f = fake(items, { pages });
  await runResolve(f.deps);
  assertEquals(f.calls.fetchPage, 8);
  assert((f.peakPerHost.get('busy.example') ?? 0) <= 2, `peak ${f.peakPerHost.get('busy.example')}`);
});

// ─── Billing guard ───────────────────────────────────────────────────────────

Deno.test('billing guard: nothing claimed → no quota, fetch, Claude or embed work', async () => {
  let external = 0;
  const f = fake([], {
    adjudicate: async () => {
      external++;
      return { input: null, usage: { input_tokens: 0, output_tokens: 0 } };
    },
    embedImages: async () => {
      external++;
      return new Map();
    },
  });
  const summary = await runResolve(f.deps);
  assertEquals(summary.claimed, 0);
  assertEquals(external, 0);
  assertEquals(Object.keys(f.calls), ['claim']);
});

// ─── Adjudication ────────────────────────────────────────────────────────────

const FLAGGED = {
  needs_adjudication: true,
  adjudication: {
    images: [{ key: 'pic-a' }, { key: 'pic-b' }],
    texts: [{ key: 't1', text: 'Harmony sofa by Example Home' }, { key: 't2', text: 'Brass lamp' }],
    links: [{ id: 'l1', url: 'https://shop.example/products/harmony-sofa' }],
  },
};

Deno.test('adjudication: one call per flagged slide only; assignments feed the pieces', async () => {
  const prompts: unknown[] = [];
  const f = fake([
    item('pic-a', FLAGGED),
    item('pic-b', FLAGGED),
    item('plain', { caption: { sku: 'AB-12', vendor: 'V' } }, { slide_index: 2 }),
  ], {
    skus: { 'AB-12': 'prod-ok' },
    pages: { 'https://shop.example/products/harmony-sofa': productHtml('Harmony Sofa', '1999') },
    words: { 'Brass lamp': [{ product_id: 'prod-lamp', score: 0.9 }] },
    adjudicate: async (context) => {
      prompts.push(context);
      return {
        input: {
          assignments: [
            { image_element_key: 'pic-a', text_element_keys: ['t1', 'nope'], link_ids: ['l1'] },
            { image_element_key: 'pic-b', text_element_keys: ['t2'], link_ids: ['l1'] },
            { image_element_key: 'invented', text_element_keys: [], link_ids: [] },
          ],
        },
        usage: { input_tokens: 1000, output_tokens: 200 },
      };
    },
  });
  const summary = await runResolve(f.deps);
  assertEquals(prompts.length, 1);
  assertEquals(summary.adjudications, 1);
  assertEquals(summary.cost_usd, 0.004);
  const a = recordFor(f, 'pic-a').candidates[0];
  assertEquals(a.extracted?.name, 'Harmony Sofa');
  assertEquals(a.band, 'likely');
  assertEquals(a.evidence.adjudicated, true);
  // l1 went to pic-a only; pic-b resolves from its assigned words.
  assertEquals(recordFor(f, 'pic-b').candidates.map((c) => c.product_id), ['prod-lamp']);
  assertEquals(recordFor(f, 'plain').candidates[0].evidence.adjudicated, undefined);
});

Deno.test('ANTHROPIC_API_KEY unset: no Claude call, deterministic results, nothing parks', async () => {
  const f = fake([
    item('pic-a', { ...FLAGGED, caption: { sku: 'AB-12', vendor: 'V' } }),
    item('pic-b', FLAGGED),
  ], { skus: { 'AB-12': 'prod-ok' }, adjudicate: null });
  const summary = await runResolve(f.deps);
  assertEquals(summary.adjudications, 0);
  assertEquals(recordFor(f, 'pic-a').state, 'found');
  assertEquals(recordFor(f, 'pic-b').state, 'not_found');
  assert(f.recorded.every((r) => r.state !== 'pending'));
});

Deno.test('idempotent re-run: same candidates, the slide is adjudicated once', async () => {
  let calls = 0;
  const store = new Map<number, AdjudicationAssignment[] | null>();
  const items = [
    item('pic-a', FLAGGED),
    item('sku', { caption: { sku: 'AB-12', vendor: 'V' }, links: [{ url: 'https://shop.example/products/harmony-sofa', on_picture: true }] }),
  ];
  const options = {
    skus: { 'AB-12': 'prod-ok' },
    pages: { 'https://shop.example/products/harmony-sofa': productHtml('Harmony Sofa', '1999') },
    adjudicationStore: store,
    adjudicate: async () => {
      calls++;
      return {
        input: { assignments: [{ image_element_key: 'pic-a', text_element_keys: [], link_ids: ['l1'] }] },
        usage: { input_tokens: 10, output_tokens: 10 },
      };
    },
  };
  const first = fake(items, options);
  await runResolve(first.deps);
  const second = fake(items, options);
  await runResolve(second.deps);
  assertEquals(calls, 1);
  for (const key of ['pic-a', 'sku']) {
    assertEquals(recordFor(second, key).candidates, recordFor(first, key).candidates);
  }
  // The same page found twice (picture link + sku) is one candidate each, no duplicates.
  const keys = recordFor(second, 'sku').candidates.map((c) => c.product_id ?? c.extracted?.source_url);
  assertEquals(new Set(keys).size, keys.length);
});

Deno.test('finalizeCandidates dedupes one page across tiers, best band wins', () => {
  const out = finalizeCandidates([
    { source: 'link', extracted: { source_url: 'https://shop.example/p/1?utm_source=x' }, band: 'likely', evidence: {} },
    { source: 'link', extracted: { source_url: 'https://www.shop.example/p/1/' }, band: 'strong', evidence: {} },
    { source: 'words', product_id: 'a', band: 'possible', evidence: {} },
    { source: 'words', product_id: 'a', band: 'likely', evidence: {} },
  ]);
  assertEquals(out.map((c) => [c.source, c.band, c.rank]), [['link', 'strong', 1], ['words', 'likely', 2]]);
});

// ─── Pairing by look (mocked vectors) ────────────────────────────────────────

function linkItem(key: string, url: string, extra: Record<string, unknown> = {}): ClaimedItem {
  return item(key, { links: [{ url, on_picture: false }], unpaired: true, ...extra }, {
    element_key: `link:${key}`,
    board_item_id: null,
    item_id: `item-${key}`,
  });
}

Deno.test('pairing: a clear look match moves the link onto the crop as likely, paired_by=look', async () => {
  const f = fake([linkItem('L1', 'https://shop.example/products/sofa')], {
    pages: { 'https://shop.example/products/sofa': productHtml('Sofa', '100', 'https://cdn.shop.example/sofa.jpg') },
    pairablePictures: async () => [
      { item_id: 'pic-1', slide_index: 1, image_url: 'https://signed/1' },
      { item_id: 'pic-2', slide_index: 1, image_url: 'https://signed/2' },
    ],
    embedImages: async (inputs) => {
      const v: Record<string, number[]> = {
        'link:item-L1': [1, 0, 0],
        'crop:pic-1': [0.1, 1, 0],
        'crop:pic-2': [0.97, 0.05, 0.1],
      };
      return new Map(inputs.map((i) => [i.id, v[i.id]]));
    },
  });
  const summary = await runResolve(f.deps);
  assertEquals(summary.paired, 1);
  assertEquals(f.paired.length, 1);
  assertEquals(f.paired[0].picture, 'pic-2');
  assertEquals(f.paired[0].candidates[0].band, 'likely');
  assertEquals(f.paired[0].candidates[0].evidence.paired_by, 'look');
});

Deno.test('pairing: ambiguous look stays unassigned; no embedder means no pairing', async () => {
  const pictures = async () => [
    { item_id: 'pic-1', slide_index: 1, image_url: 'https://signed/1' },
    { item_id: 'pic-2', slide_index: 1, image_url: 'https://signed/2' },
  ];
  const pages = { 'https://shop.example/products/sofa': productHtml('Sofa', '100') };
  const ambiguous = fake([linkItem('L1', 'https://shop.example/products/sofa')], {
    pages,
    pairablePictures: pictures,
    embedImages: async (inputs) => {
      const v: Record<string, number[]> = { 'link:item-L1': [1, 0], 'crop:pic-1': [0.95, 0.3], 'crop:pic-2': [0.95, 0.31] };
      return new Map(inputs.map((i) => [i.id, v[i.id]]));
    },
  });
  await runResolve(ambiguous.deps);
  assertEquals(ambiguous.paired, []);
  // The link row stays found with no crop: "which picture?".
  assertEquals(recordFor(ambiguous, 'L1').state, 'found');

  const none = fake([linkItem('L1', 'https://shop.example/products/sofa')], { pages, pairablePictures: pictures });
  await runResolve(none.deps);
  assertEquals(none.paired, []);
});

Deno.test('pairing: slide links stay on their slide; deck links pair deck-wide', async () => {
  const f = fake([
    linkItem('S', 'https://shop.example/products/a'),
    linkItem('D', 'https://shop.example/products/b', { deck_level: true }),
  ], {
    pages: {
      'https://shop.example/products/a': productHtml('A', '1', 'https://cdn.shop.example/a.jpg'),
      'https://shop.example/products/b': productHtml('B', '1', 'https://cdn.shop.example/b.jpg'),
    },
    pairablePictures: async () => [
      { item_id: 'pic-slide3', slide_index: 3, image_url: 'https://signed/3' },
      { item_id: 'pic-slide5', slide_index: 5, image_url: 'https://signed/5' },
    ],
    embedImages: async (inputs) => {
      const v: Record<string, number[]> = {
        'link:item-S': [1, 0],
        'link:item-D': [0, 1],
        'crop:pic-slide3': [1, 0],
        'crop:pic-slide5': [0, 1],
      };
      return new Map(inputs.map((i) => [i.id, v[i.id]]));
    },
  });
  await runResolve(f.deps);
  // S is a slide-1 link: no slide-1 crop, so it stays unassigned even though
  // the slide-3 crop matches. D is deck-level and pairs anywhere.
  assertEquals(f.paired.map((p) => [p.link, p.picture]), [['item-D', 'pic-slide5']]);
});
