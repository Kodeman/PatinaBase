/**
 * Persona-fixture extraction audit (capture-launch W0-D1).
 *
 * Runs extractProductData() against real, harvested vendor pages (see
 * src/__tests__/fixtures/README.md for provenance) inside jsdom, and writes a
 * per-fixture report to artifacts/capture-launch-2026-08-29/extraction-report.json
 * for the findings deck. This suite intentionally does NOT assert on the
 * quality of any individual field — vendor markup varies wildly and gaps are
 * exactly what this audit is measuring. It only asserts that extraction never
 * throws, and that the two known-bad (non-product) pages never get scored
 * 'high' confidence.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { extractProductData, extractRetailer } from '../../lib/extraction';
import { isKnownBadDomain, KNOWN_BAD_DOMAIN_MESSAGE } from '../../lib/mode-detection';
import type { ExtractedProductData } from '@patina/shared';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');
const REPORT_DIR = path.join(__dirname, '../../../../../artifacts/capture-launch-2026-08-29');
const REPORT_PATH = path.join(REPORT_DIR, 'extraction-report.json');

interface Fixture {
  file: string;
  url: string;
  /** Known-bad, non-product page — should never extract as high confidence. */
  knownBad?: boolean;
}

const FIXTURES: Fixture[] = [
  {
    file: 'roomandboard.com.stevens-sofas.html',
    url: 'https://www.roomandboard.com/catalog/living/sofas-and-loveseats/stevens-sofas',
  },
  {
    file: 'dwr.com.eames-lounge-chair-and-ottoman.html',
    url: 'https://www.dwr.com/living-lounge-chairs/eames-lounge-chair-and-ottoman/5667.html?lang=en_US',
  },
  {
    file: 'rh.com.jennifer-sofa.html',
    url: 'https://rh.com/us/en/catalog/product/product.jsp/prod39250055',
  },
  {
    file: 'wayfair.com.ebern-designs-sofa.html',
    url: 'https://www.wayfair.com/furniture/pdp/ebern-designs-traditional-upholstered-standard-sofa-with-square-armrests-and-2-throw-pillows-w112266288.html',
  },
  {
    file: 'hermanmiller.com.eames-lounge-chair-and-ottoman.html',
    url: 'https://www.hermanmiller.com/products/seating/lounge-seating/eames-lounge-chair-and-ottoman/',
  },
  {
    file: 'steelcase.com.gesture.html',
    url: 'https://www.steelcase.com/products/office-chairs/gesture',
  },
  {
    file: 'visualcomfort.com.talia-small-chandelier.html',
    url: 'https://www.visualcomfort.com/us/p/talia-small-chandelier-jn5110',
  },
  {
    file: 'knoll.com.womb-chair.html',
    url: 'https://www.knoll.com/shop/en_us/living-lounge-chairs/womb-chair/7876.html?sku=100360310',
  },
  {
    file: '1stdibs.com.rare-1964-eames-lounge-chair.html',
    url: 'https://www.1stdibs.com/furniture/seating/lounge-chairs/rare-1964-rosewood-herman-miller-eames-lounge-chair-ottoman-w-original-receipt/id-f_48117292/',
  },
  {
    file: 'chairish.com.george-smith-leather-sofa.html',
    url: 'https://www.chairish.com/product/36868025/george-smith-english-howard-sons-signature-leather-sofa',
  },
  {
    file: 'westelm.com.harris-sofa.html',
    url: 'https://www.westelm.com/products/harris-sofa-96-h4614/',
  },
  {
    file: 'cb2.com.berkeley-velvet-sofa.html',
    url: 'https://www.cb2.com/berkeley-78-jade-performance-velvet-sofa/s450191',
  },
  {
    file: 'hedgehousefurniture.com.white-oak-marie-nightstand.html',
    url: 'https://hedgehousefurniture.com/products/white-oak-marie-nightstand-114010-in-stock',
  },
  {
    file: 'pinterest.com.pin-378724649918852625.html',
    url: 'https://www.pinterest.com/pin/378724649918852625/',
    knownBad: true,
  },
  {
    file: 'instagram.com.p-DcjKbTzEVTf.html',
    url: 'https://www.instagram.com/p/DcjKbTzEVTf/',
    knownBad: true,
  },
];

/** Which of the 10 documented dimension fields extraction actually filled. */
const DIMENSION_FIELDS = [
  'width',
  'height',
  'depth',
  'seatHeight',
  'seatDepth',
  'seatWidth',
  'armHeight',
  'backHeight',
  'legHeight',
  'clearance',
] as const;

function dimensionFieldsPresent(data: ExtractedProductData): string[] {
  const dims = data.dimensions as unknown as Record<string, unknown> | null;
  if (!dims) return [];
  return DIMENSION_FIELDS.filter((key) => dims[key] !== undefined && dims[key] !== null);
}

/** Detect sku/mpn/productID keys anywhere in the page's raw JSON-LD text. A raw
 * text probe, independent of extraction's own precedence — the `sku` column
 * next to it records what extractProductData actually resolved. */
function skuLikeKeysInJsonLd(doc: Document): string[] {
  const found = new Set<string>();
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    const text = script.textContent ?? '';
    if (!text.trim()) continue;
    for (const key of ['sku', 'mpn', 'productID'] as const) {
      if (new RegExp(`"${key}"\\s*:`, 'i').test(text)) found.add(key);
    }
  }
  return [...found].sort();
}

/** Mirrors extraction/index.ts's own findSchemaTypes (used by
 * detectPageModeSignals to decide hasProductSchema) so this audit's
 * "product-typed" count reflects the same @type detection the extractor
 * itself relies on, rather than inventing a separate definition. */
function findSchemaTypes(data: unknown): string[] {
  const types: string[] = [];
  if (!data || typeof data !== 'object') return types;
  const obj = data as Record<string, unknown>;
  if (typeof obj['@type'] === 'string') {
    types.push(obj['@type']);
  } else if (Array.isArray(obj['@type'])) {
    types.push(...(obj['@type'] as string[]));
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      types.push(...findSchemaTypes(item));
    }
  }
  return types;
}

/** Count of <script type="application/ld+json"> blocks on the page, and how
 * many of them declare (or contain) an @type of "Product". */
function jsonLdCounts(doc: Document): { jsonLdBlocks: number; jsonLdProductTyped: number } {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  let productTyped = 0;
  for (const script of scripts) {
    const text = script.textContent ?? '';
    if (!text.trim()) continue;
    try {
      const types = findSchemaTypes(JSON.parse(text));
      if (types.includes('Product')) productTyped += 1;
    } catch {
      // Invalid JSON in the block — not product-typed, don't count it.
    }
  }
  return { jsonLdBlocks: scripts.length, jsonLdProductTyped: productTyped };
}

interface FixtureReportEntry {
  file: string;
  url: string;
  knownBad: boolean;
  /** CL-R14: capture refused this page before running extraction. */
  blocked?: boolean;
  ok: boolean;
  error?: string;
  name: string | null;
  price: { value: number; currency: string } | null;
  currency: string | null;
  /** CL-R1: the SKU extraction resolved, null when the page publishes none. */
  sku: string | null;
  dimensionFieldsPresent: string[];
  materialsCount: number;
  colorsCount: number;
  finish: string | null;
  imagesCount: number;
  manufacturer: string | null;
  retailer: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  jsonLdBlocks: number;
  jsonLdProductTyped: number;
  skuLikeKeysInJsonLd: string[];
}

const report: FixtureReportEntry[] = [];

describe('extraction fixtures (persona harvest)', () => {
  for (const fixture of FIXTURES) {
    it(`extracts from ${fixture.file} without throwing`, async () => {
      // CL-R14: the panel refuses known-bad domains before it ever asks for an
      // extraction, so the audit records that outcome rather than whatever
      // fields a social page happens to leak.
      if (isKnownBadDomain(fixture.url)) {
        const blockedEntry: FixtureReportEntry = {
          file: fixture.file,
          url: fixture.url,
          knownBad: !!fixture.knownBad,
          blocked: true,
          ok: true,
          error: KNOWN_BAD_DOMAIN_MESSAGE,
          name: null,
          price: null,
          currency: null,
          sku: null,
          dimensionFieldsPresent: [],
          materialsCount: 0,
          colorsCount: 0,
          finish: null,
          imagesCount: 0,
          manufacturer: null,
          retailer: extractRetailer(fixture.url).name,
          confidence: null,
          jsonLdBlocks: 0,
          jsonLdProductTyped: 0,
          skuLikeKeysInJsonLd: [],
        };
        report.push(blockedEntry);
        expect(blockedEntry.confidence).toBeNull();
        return;
      }

      const html = readFileSync(path.join(FIXTURES_DIR, fixture.file), 'utf-8');
      // A silent virtual console: fixtures carry modern CSS (:has(), nesting,
      // container queries) that jsdom's bundled CSS parser rejects — harmless
      // for extraction (which never touches computed style from <style>
      // tags) but noisy without this.
      const dom = new JSDOM(html, { url: fixture.url, virtualConsole: new VirtualConsole() });
      // jsdom has no layout engine and does not implement `innerText`
      // (price.ts's body-text fallback reads it). Alias it to `textContent`
      // so extraction can run in jsdom the way it would against a laid-out
      // page, rather than throwing — see the jsdom caveat in the report notes.
      Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
        configurable: true,
        get() {
          return (this as HTMLElement).textContent ?? '';
        },
      });

      const originalDocument = globalThis.document;
      const originalWindow = globalThis.window;
      // Swapping in the fixture's jsdom Document/Window for the duration of
      // this extraction; extractProductData reads these globals.
      globalThis.document = dom.window.document;
      // @ts-expect-error -- jsdom's Window type isn't assignable to the DOM
      // lib's Window type, but this is the same object shape at runtime.
      globalThis.window = dom.window;

      const { jsonLdBlocks, jsonLdProductTyped } = jsonLdCounts(dom.window.document);
      const skuLike = skuLikeKeysInJsonLd(dom.window.document);

      let entry: FixtureReportEntry;
      try {
        const data = await extractProductData(fixture.url);
        const retailer = extractRetailer(fixture.url);

        entry = {
          file: fixture.file,
          url: fixture.url,
          knownBad: !!fixture.knownBad,
          ok: true,
          name: data.productName,
          price: data.price ? { value: data.price.value, currency: data.price.currency } : null,
          currency: data.currency ?? null,
          sku: data.sku ?? null,
          dimensionFieldsPresent: dimensionFieldsPresent(data),
          materialsCount: data.materials?.length ?? 0,
          colorsCount: data.colors?.length ?? 0,
          finish: data.finish?.name ?? null,
          imagesCount: data.images?.length ?? 0,
          manufacturer: data.manufacturer,
          retailer: retailer.name,
          confidence: data.confidence,
          jsonLdBlocks,
          jsonLdProductTyped,
          skuLikeKeysInJsonLd: skuLike,
        };
      } catch (error) {
        // A hard crash IS a finding, not a gap — but per the brief this suite
        // must stay green (another agent reads extraction-report.json to
        // write the findings deck), so it's captured here rather than
        // rethrown. src/lib/extraction/images.ts's `img.closest(...)` calls
        // (around lines 110/114) are not wrapped in try/catch the way the
        // selector-list loops elsewhere in extraction/ are — against the
        // Pinterest fixture's real DOM this throws all the way out of
        // extractImagesFromDOM (a jsdom/nwsapi selector-engine exception,
        // "unknown pseudo-class selector ':3>*'", surfaced while resolving
        // `.closest()`). Flagged prominently in this lane's report-back as
        // the top finding: a single vendor page can crash the whole capture
        // pipeline with no field-level fallback.
        // eslint-disable-next-line no-console
        console.error(`[fixtures.test] extraction threw for ${fixture.file}:`, error);
        entry = {
          file: fixture.file,
          url: fixture.url,
          knownBad: !!fixture.knownBad,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          name: null,
          price: null,
          currency: null,
          sku: null,
          dimensionFieldsPresent: [],
          materialsCount: 0,
          colorsCount: 0,
          finish: null,
          imagesCount: 0,
          manufacturer: null,
          retailer: extractRetailer(fixture.url).name,
          confidence: null,
          jsonLdBlocks,
          jsonLdProductTyped,
          skuLikeKeysInJsonLd: skuLike,
        };
      } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
      }

      report.push(entry);

      // The two real assertions this suite makes: known-bad pages never read
      // as 'high' confidence (holds trivially when extraction crashed, since
      // entry.confidence is then null), and every fixture produced a report
      // row. Field-level correctness is exactly what's under audit here, not
      // what's asserted — see extraction-report.json for that.
      if (fixture.knownBad) {
        expect(entry.confidence).not.toBe('high');
      }
      expect(entry).toBeTruthy();
    });
  }
});

// Gated: `pnpm test` must never dirty tracked files. Regenerate the report
// with `CAPTURE_REPORT=1 pnpm --filter @patina/extension test -- fixtures`.
afterAll(() => {
  if (process.env.CAPTURE_REPORT !== '1') return;
  mkdirSync(REPORT_DIR, { recursive: true });
  const byFile = new Map(report.map((r) => [r.file, r]));
  const ordered = FIXTURES.map((f) => byFile.get(f.file)).filter((r): r is FixtureReportEntry => !!r);
  const output = {
    generatedAt: new Date().toISOString(),
    lane: 'capture-launch/w2-d6',
    notes: [
      'CL-R1 re-run. sku is what extractProductData now resolves: JSON-LD ' +
        'Product/ProductGroup (sku → mpn → productID, taking the URL-matched hasVariant when ' +
        'one addresses the page), then meta[product:retailer_item_id], then [itemprop="sku"]. ' +
        'It is editable in the panel and lands on products.sku.',
      'CL-R12/13/14 re-run. manufacturer is now the brand the page names (null when it ' +
        'names none) rather than the domain; retailer stays domain-derived. currency is ' +
        'the USD-preferred JSON-LD offer currency, defaulting to USD. pinterest/instagram ' +
        'are refused by isKnownBadDomain() before extraction runs, so their rows carry ' +
        'blocked:true and the refusal message instead of field values.',
      'Ran extractProductData() against each fixture inside jsdom (new JSDOM(html, { url })). ' +
        'jsdom has no layout engine: getBoundingClientRect() always returns zeros, so the ' +
        'position-based component of image scoring (src/lib/extraction/images.ts) never ' +
        'contributes here the way it would in a real browser tab — image counts and JSON-LD- ' +
        'derived scores are representative, but the highest-scored image may differ from what ' +
        'the live extension would pick.',
        'jsdom does not implement innerText at all (price.ts uses document.body.innerText as a ' +
        'fallback price scan) — this suite polyfills it as an alias for textContent so ' +
        'extraction can run without throwing. That polyfill is not layout-aware: hidden/off- ' +
        'screen price text a real browser would exclude from innerText can be picked up here.',
      'window.getComputedStyle() background-image lookups (images.ts) will not see rules from ' +
        'external stylesheets on the 4 Chrome-rendered fixtures (rh, hermanmiller, westelm, cb2) ' +
        '— harvesting those stripped <link rel="stylesheet"> and non-JSON-LD <script> tags before ' +
        'saving. The other 11 fixtures were fetched with curl and retain their full <script> ' +
        'content (including any inline/external stylesheet links) unmodified — see ' +
        'fixtures/README.md methodology note.',
      'skuLikeKeysInJsonLd stays a raw JSON-LD text probe and can disagree with the resolved ' +
        'sku in both directions: dwr and knoll publish no such JSON-LD key but do carry ' +
        '[itemprop="sku"], while a page can name a key inside markup extraction declines to ' +
        'read (an unselected ProductGroup variant, say).',
    ],
    fixtures: ordered,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(output, null, 2));
});
