/**
 * CL-R12 — the manufacturer is the brand the page names, never the domain.
 *
 * Runs against the harvested vendor fixtures (src/__tests__/fixtures) in jsdom,
 * the same way fixtures.test.ts does, so these assertions are pinned to real
 * vendor markup rather than hand-written HTML.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'fs';
import path from 'path';
import { extractPageBrand, extractManufacturerFromPage } from '../../lib/extraction/manufacturer';
import { extractRetailer, RETAILER_MAP } from '../../lib/extraction/retailer';
import { extractProductData } from '../../lib/extraction';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

function loadFixture(file: string, url: string): void {
  const html = readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  globalThis.document = dom.window.document;
  // @ts-expect-error -- jsdom's Window isn't assignable to the DOM lib's Window,
  // but it is the same shape at runtime.
  globalThis.window = dom.window;
}

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
});

describe('extractPageBrand (CL-R12)', () => {
  it('reads the DWR inline-script catalog slug as the maker, not the storefront', () => {
    const url = 'https://www.dwr.com/living-lounge-chairs/eames-lounge-chair-and-ottoman/5667.html?lang=en_US';
    loadFixture('dwr.com.eames-lounge-chair-and-ottoman.html', url);

    expect(extractPageBrand()?.name).toBe('Herman Miller');
    expect(extractRetailer(url).name).toBe('Design Within Reach');
  });

  it('reads a JSON-LD / meta brand on a multi-brand marketplace', () => {
    const url = 'https://www.chairish.com/product/36868025/george-smith-english-howard-sons-signature-leather-sofa';
    loadFixture('chairish.com.george-smith-leather-sofa.html', url);

    expect(extractPageBrand()?.name).toBe('George Smith');
    expect(extractRetailer(url).name).toBe('Chairish');
  });

  it('returns null on rh.com rather than the domain table name', () => {
    const url = 'https://rh.com/us/en/catalog/product/product.jsp/prod39250055';
    loadFixture('rh.com.jennifer-sofa.html', url);

    // The page publishes no og:brand/product:brand/itemprop=brand/JSON-LD brand
    // (only a proprietary <meta name="rhBrand">), so there is no brand to take.
    expect(extractPageBrand()).toBeNull();
    expect(extractRetailer(url).name).toBe('Restoration Hardware');
  });

  it('returns null on westelm.com rather than the domain table name', () => {
    const url = 'https://www.westelm.com/products/harris-sofa-96-h4614/';
    loadFixture('westelm.com.harris-sofa.html', url);

    expect(extractPageBrand()).toBeNull();
    expect(extractRetailer(url).name).toBe('West Elm');
  });

  it('keeps brand == retailer on a direct-to-consumer maker site', () => {
    const url = 'https://www.roomandboard.com/catalog/living/sofas-and-loveseats/stevens-sofas';
    loadFixture('roomandboard.com.stevens-sofas.html', url);

    expect(extractPageBrand()?.name).toBe('Room & Board');
    expect(extractRetailer(url).name).toBe('Room & Board');
  });

  it('does not mistake 1stDibs\' opaque "brand" ids for a maker name', () => {
    const url =
      'https://www.1stdibs.com/furniture/seating/lounge-chairs/rare-1964-rosewood-herman-miller-eames-lounge-chair-ottoman-w-original-receipt/id-f_48117292/';
    loadFixture('1stdibs.com.rare-1964-eames-lounge-chair.html', url);

    // The page carries `"brand":"f_8350"` style internal ids only.
    expect(extractPageBrand()).toBeNull();
    expect(extractRetailer(url).name).toBe('1stDibs');
  });

  it('reports no maker on hermanmiller.com — the page declares no brand anywhere', () => {
    const url = 'https://www.hermanmiller.com/products/seating/lounge-seating/eames-lounge-chair-and-ottoman/';
    loadFixture('hermanmiller.com.eames-lounge-chair-and-ottoman.html', url);

    expect(extractPageBrand()).toBeNull();
    // The retailer is still known — a null maker never falls back to it.
    expect(extractRetailer(url).name).toBe('Herman Miller');
  });
});

describe('JSON-LD brand shapes (CL-R12)', () => {
  function setJsonLd(json: string): void {
    document.head.innerHTML = '';
    document.body.innerHTML = `<script type="application/ld+json">${json}</script>`;
  }

  it('reads a brand given as an array of objects', () => {
    setJsonLd('{"@type":"Product","name":"Chair","brand":[{"@type":"Brand","name":"Vitra"}]}');
    expect(extractPageBrand()?.name).toBe('Vitra');
  });

  it('reads a brand given as an array of strings', () => {
    setJsonLd('{"@type":"Product","name":"Chair","brand":["Muuto","Ignored"]}');
    expect(extractPageBrand()?.name).toBe('Muuto');
  });

  it('reads a brand when @type is an array that includes Product', () => {
    setJsonLd('{"@type":["Thing","Product"],"name":"Chair","brand":{"name":"Fritz Hansen"}}');
    expect(extractPageBrand()?.name).toBe('Fritz Hansen');
  });

  it('reads a ProductGroup top-level brand', () => {
    setJsonLd(
      '{"@type":"ProductGroup","name":"Harris Sofa","brand":{"@type":"Brand","name":"West Elm"},' +
        '"hasVariant":[{"@type":"Product","name":"Harris 96in"}]}'
    );
    expect(extractPageBrand()?.name).toBe('West Elm');
  });

  it('falls back to manufacturer when no brand is published', () => {
    setJsonLd('{"@type":"Product","name":"Chair","manufacturer":{"name":"Knoll"}}');
    expect(extractPageBrand()?.name).toBe('Knoll');
  });

  it('ignores an empty brand array', () => {
    setJsonLd('{"@type":"Product","name":"Chair","brand":[]}');
    expect(extractPageBrand()).toBeNull();
  });
});

describe('inline-script brand slugs (CL-R12)', () => {
  function setInlineBrand(slug: string): void {
    document.head.innerHTML = '';
    document.body.innerHTML = `<script>window.__cfg = {"brand":"brands-${slug}"};</script>`;
  }

  const cases: Array<[string, string]> = [
    ['b-b-italia', 'B&B Italia'],
    ['rh-modern', 'RH Modern'],
    ['cb2', 'CB2'],
    ['hay', 'HAY'],
    ['dwr', 'Design Within Reach'],
    // Not in the map — title-cased.
    ['herman-miller', 'Herman Miller'],
    ['ligne-roset', 'Ligne Roset'],
  ];

  it.each(cases)('resolves brands-%s to %s', (slug, expected) => {
    setInlineBrand(slug);
    expect(extractPageBrand()?.name).toBe(expected);
  });
});

describe('D2C divergence (CL-R12)', () => {
  it('keeps the maker on the capture while the vendor slot reads "no separate maker"', async () => {
    const url = 'https://www.roomandboard.com/catalog/living/sofas-and-loveseats/stevens-sofas';
    loadFixture('roomandboard.com.stevens-sofas.html', url);

    // The capture records the brand the page names, even when it equals the
    // retailer — a designer specifying a Room & Board sofa needs the maker.
    const data = await extractProductData(url);
    expect(data.manufacturer).toBe('Room & Board');

    // The vendor-linking path deliberately reports null instead: there is no
    // *separate* manufacturer vendor to link on a direct-to-consumer site.
    expect(extractManufacturerFromPage(url)).toBeNull();
  });
});

describe('RETAILER_MAP (CL-R12)', () => {
  it('maps B&B Italia to its real domain', () => {
    expect(RETAILER_MAP['bebitalia.com']).toBe('B&B Italia');
    expect(RETAILER_MAP['bfremodern.com']).toBeUndefined();
  });
});
