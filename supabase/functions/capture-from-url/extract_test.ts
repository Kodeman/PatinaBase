// Deno tests for the PURE product extractor. No network.
// Run: deno test extract_test.ts --no-check
//
// Covers each of the three extraction paths (Open Graph, JSON-LD, meta/title),
// price parsing, entity decoding, relative-image resolution + dedupe, and a
// no-data page.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { extractProduct, parsePriceToCents } from './extract.ts';

// ─── Path 1 · Open Graph (wins over JSON-LD + title) ──────────────────────────

const OG_HTML = `<!doctype html><html><head>
<meta property="og:title" content="Aged Oak Dining Table" />
<meta property="og:description" content="A hand-finished solid oak table." />
<meta property="og:image" content="https://cdn.example.com/img/table-1.jpg" />
<meta property="og:image" content="/img/table-2.jpg" />
<meta property="og:image" content="https://cdn.example.com/img/table-1.jpg" />
<meta property="product:price:amount" content="2499.00" />
<meta property="product:price:currency" content="USD" />
<meta property="product:brand" content="Nordic Atelier" />
<title>Ignored because OG wins | Retailer</title>
<script type="application/ld+json">{"@type":"Product","name":"JSON-LD name should lose","offers":{"price":"1.00"}}</script>
</head><body></body></html>`;

Deno.test('extract · Open Graph path (and OG beats JSON-LD/title)', () => {
  const r = extractProduct(OG_HTML, 'https://shop.example.com/p/1');
  assertEquals(r.name, 'Aged Oak Dining Table');
  assertEquals(r.brand, 'Nordic Atelier');
  assertEquals(r.description, 'A hand-finished solid oak table.');
  assertEquals(r.priceRetailCents, 249900);
  // Relative image resolved against the page URL; the duplicate collapses.
  assertEquals(r.images, [
    'https://cdn.example.com/img/table-1.jpg',
    'https://shop.example.com/img/table-2.jpg',
  ]);
  assertEquals(r.sourceUrl, 'https://shop.example.com/p/1');
});

// ─── Path 2 · JSON-LD (@graph, brand object, numeric price, image array) ──────

const LD_HTML = `<!doctype html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebPage","name":"not the product"},
  {"@type":"Product","name":"Brass Arc Floor Lamp",
   "brand":{"@type":"Brand","name":"Lumen and Co"},
   "description":"An arcing brass floor lamp.",
   "image":["https://cdn.example.com/lamp-a.jpg","https://cdn.example.com/lamp-b.jpg"],
   "offers":{"@type":"Offer","price":1299.5,"priceCurrency":"USD"}}
]}
</script>
</head><body></body></html>`;

Deno.test('extract · JSON-LD path', () => {
  const r = extractProduct(LD_HTML, 'https://lights.example.com/lamp');
  assertEquals(r.name, 'Brass Arc Floor Lamp');
  assertEquals(r.brand, 'Lumen and Co');
  assertEquals(r.description, 'An arcing brass floor lamp.');
  assertEquals(r.priceRetailCents, 129950);
  assertEquals(r.images, [
    'https://cdn.example.com/lamp-a.jpg',
    'https://cdn.example.com/lamp-b.jpg',
  ]);
  assertEquals(r.sourceUrl, 'https://lights.example.com/lamp');
});

// ─── Path 3 · meta / <title> heuristics ───────────────────────────────────────

const META_HTML = `<!doctype html><html><head>
<title>Linen Slipcover Sofa | Cozy Home Co</title>
<meta name="description" content="A deep, slipcovered linen sofa." />
<meta name="brand" content="Cozy Home Co" />
</head><body></body></html>`;

Deno.test('extract · meta/title fallback path', () => {
  const r = extractProduct(META_HTML, 'https://cozy.example.com/sofa');
  assertEquals(r.name, 'Linen Slipcover Sofa'); // trailing " | Cozy Home Co" stripped
  assertEquals(r.description, 'A deep, slipcovered linen sofa.');
  assertEquals(r.brand, 'Cozy Home Co');
  assertEquals(r.priceRetailCents, null);
  assertEquals(r.images, []);
  assertEquals(r.sourceUrl, 'https://cozy.example.com/sofa');
});

// ─── No-data page ─────────────────────────────────────────────────────────────

Deno.test('extract · no-data page returns mostly empty (only sourceUrl)', () => {
  const r = extractProduct('<!doctype html><html><body>nothing here</body></html>', 'https://blank.example.com/');
  assertEquals(r.name, null);
  assertEquals(r.brand, null);
  assertEquals(r.description, null);
  assertEquals(r.priceRetailCents, null);
  assertEquals(r.images, []);
  assertEquals(r.sourceUrl, 'https://blank.example.com/');
});

// ─── Entity decoding ──────────────────────────────────────────────────────────

Deno.test('extract · decodes HTML entities in meta content', () => {
  const r = extractProduct(
    `<meta property="og:title" content="Oak &amp; Ash Bench &#8212; No. 3" />`,
    'https://x.example.com/',
  );
  assertEquals(r.name, 'Oak & Ash Bench — No. 3');
});

// ─── Price parsing table ──────────────────────────────────────────────────────

Deno.test('parsePriceToCents · table', () => {
  const cases: Array<[string | number | null | undefined, number | null]> = [
    ['$1,234.56', 123456],
    ['1234', 123400],
    ['99.99', 9999],
    ['$0.50', 50],
    ['1,000', 100000],
    ['USD 2,499.00', 249900],
    ['2499.9', 249990],
    [1299.5, 129950],
    [42, 4200],
    ['', null],
    ['free', null],
    [null, null],
    [undefined, null],
  ];
  for (const [input, expected] of cases) {
    assertEquals(parsePriceToCents(input), expected, `parsePriceToCents(${JSON.stringify(input)})`);
  }
});
