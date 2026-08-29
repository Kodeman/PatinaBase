/**
 * CL-R13 — currency selection, price precedence, and the body-text guard.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'fs';
import path from 'path';
import { extractPriceWithSource, STRICT_DOLLAR_PATTERN } from '../../lib/extraction/price';
import { extractProductData } from '../../lib/extraction';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

function loadFixture(file: string, url: string): void {
  const html = readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  globalThis.document = dom.window.document;
  // @ts-expect-error -- jsdom's Window isn't assignable to the DOM lib's Window.
  globalThis.window = dom.window;
}

function setPage(html: string): void {
  document.head.innerHTML = '';
  document.body.innerHTML = html;
}

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
});

describe('offer currency selection (CL-R13)', () => {
  it('takes the USD offer from 1stDibs\' multi-currency offers array', () => {
    loadFixture(
      '1stdibs.com.rare-1964-eames-lounge-chair.html',
      'https://www.1stdibs.com/furniture/seating/lounge-chairs/rare-1964-rosewood-herman-miller-eames-lounge-chair-ottoman-w-original-receipt/id-f_48117292/'
    );

    const result = extractPriceWithSource();
    // CHF 7,843.64 is listed first; USD 9,500 is seventh.
    expect(result?.price.currency).toBe('USD');
    expect(result?.price.value).toBe(950000);
    expect(result?.source).toBe('json-ld');
  });

  it('falls back to the first offer that names a currency when there is no USD', () => {
    setPage(`
      <script type="application/ld+json">
        {"@type":"Product","name":"Chair","offers":[
          {"@type":"Offer","price":100},
          {"@type":"Offer","price":250,"priceCurrency":"GBP"},
          {"@type":"Offer","price":300,"priceCurrency":"EUR"}
        ]}
      </script>
    `);

    const result = extractPriceWithSource();
    expect(result?.price.currency).toBe('GBP');
    expect(result?.price.value).toBe(25000);
  });
});

describe('STRICT_DOLLAR_PATTERN (CL-R13)', () => {
  const accepts: Array<[string, string]> = [
    ['$1,499.00', '1,499.00'],
    ['$1,499', '1,499'],
    ['$12,345.67', '12,345.67'],
    // Unseparated forms — West Elm and Wayfair both ship these.
    ['$1499', '1499'],
    ['$1499.00', '1499.00'],
    ['$12345.00', '12345.00'],
    ['$999999', '999999'],
    ['$ 249.99', '249.99'],
  ];

  it.each(accepts)('accepts %s', (input, expected) => {
    expect(input.match(STRICT_DOLLAR_PATTERN)?.[1]).toBe(expected);
  });

  const rejects = [
    '$1,23456', // half-grouped junk
    '$12345678', // more digits than any furniture price
    '$', // bare glyph
  ];

  it.each(rejects)('rejects %s', (input) => {
    expect(STRICT_DOLLAR_PATTERN.test(input)).toBe(false);
  });
});

describe('price precedence (CL-R13)', () => {
  it('takes Wayfair\'s lead price, not the "under $100" nav promo', () => {
    loadFixture(
      'wayfair.com.ebern-designs-sofa.html',
      'https://www.wayfair.com/furniture/pdp/ebern-designs-traditional-upholstered-standard-sofa-with-square-armrests-and-2-throw-pillows-w112266288.html'
    );

    const result = extractPriceWithSource();
    expect(result?.price.value).toBe(43999);
    // Not the $1,333.99 strikethrough either.
    expect(result?.source).toBe('dom-text');
  });

  it('prefers a JSON-LD offer over a money-shaped string in the markup', () => {
    setPage(`
      <div class="promo-price">Everything under $99</div>
      <script type="application/ld+json">
        {"@type":"Product","name":"Sofa","offers":{"@type":"Offer","price":2450,"priceCurrency":"USD"}}
      </script>
    `);

    const result = extractPriceWithSource();
    expect(result?.source).toBe('json-ld');
    expect(result?.price.value).toBe(245000);
  });

  it('prices a ProductGroup at the variant the page URL selects', () => {
    loadFixture(
      'westelm.com.harris-sofa.html',
      'https://www.westelm.com/products/harris-sofa-96-h4614/?sku=3627456'
    );

    // sku 3627456 is the "Harris 96in Sofa" variant at $1,699.
    expect(extractPriceWithSource()?.price.value).toBe(169900);
  });

  it('prices an unselected ProductGroup at the floor of its variants', () => {
    loadFixture('westelm.com.harris-sofa.html', 'https://www.westelm.com/products/harris-sofa-96-h4614/');

    // Ten size/bench variants ($1,399–$1,899) all share this pathname and are
    // distinguished only by ?sku=, so nothing is selected: take the floor, the
    // same choice the range and "from $X" patterns make.
    expect(extractPriceWithSource()?.price.value).toBe(139900);
    expect(extractPriceWithSource()?.source).toBe('json-ld');
  });

  it('prefers a product:price:amount meta tag over JSON-LD', () => {
    document.head.innerHTML = `
      <meta property="product:price:amount" content="1875.00" />
      <meta property="product:price:currency" content="USD" />
    `;
    document.body.innerHTML = `
      <script type="application/ld+json">
        {"@type":"Product","name":"Sofa","offers":{"@type":"Offer","price":2450,"priceCurrency":"USD"}}
      </script>
    `;

    const result = extractPriceWithSource();
    expect(result?.source).toBe('meta-tag');
    expect(result?.price.value).toBe(187500);
  });
});

describe('body-text price guard (CL-R13)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('ignores money-shaped tokens inside <script> text', () => {
    // The token Instagram ships in its i18n payload; the fixture suite's
    // innerText polyfill reads textContent, so script text is visible to a
    // naive scan.
    setPage(`
      <script>window.__i18n = {"patterns":{"\\/x\\/":"\\u0001$1$2s\\u0001$3"}};</script>
      <p>No price on this page.</p>
    `);

    expect(extractPriceWithSource()).toBeNull();
  });

  it('rejects malformed digit groups', () => {
    setPage('<p>Reference $1,23456 is not a price</p>');
    expect(extractPriceWithSource()).toBeNull();
  });

  it('still reads a well-formed price out of body text', () => {
    setPage('<p>Priced at $2,450.00 today</p>');
    const result = extractPriceWithSource();
    expect(result?.source).toBe('body-text');
    expect(result?.price.value).toBe(245000);
  });

  it('reads an unseparated body-text price', () => {
    setPage('<p>Priced at $1499 today</p>');
    expect(extractPriceWithSource()?.price.value).toBe(149900);
  });

  it('skips a display:none clearance banner that precedes the real price', () => {
    setPage(`
      <div style="display:none">Clearance from $199.00</div>
      <p>Priced at $2,450.00 today</p>
    `);
    expect(extractPriceWithSource()?.price.value).toBe(245000);
  });

  it('skips hidden and aria-hidden subtrees', () => {
    setPage(`
      <div hidden><span>Was $199.00</span></div>
      <div aria-hidden="true"><span>Members pay $249.00</span></div>
      <div style="visibility:hidden">Bundle price $299.00</div>
      <p>Priced at $2,450.00 today</p>
    `);
    expect(extractPriceWithSource()?.price.value).toBe(245000);
  });

  it('never scores high confidence when the price is only a body-text hit', async () => {
    const url = 'https://example-maker.com/products/chair';
    const images = `
      <img src="https://example-maker.com/product-main-large.jpg" width="900" height="900" alt="Walnut lounge chair product photo" />
      <img src="https://example-maker.com/product-detail-large.jpg" width="900" height="900" alt="Walnut lounge chair detail photo" />
      <img src="https://example-maker.com/product-gallery-large.jpg" width="900" height="900" alt="Walnut lounge chair gallery photo" />
    `;

    document.head.innerHTML = '<meta property="og:title" content="Walnut Lounge Chair" />';
    document.body.innerHTML = `${images}<p>Priced at $2,450.00 today</p>`;
    const bodyTextOnly = await extractProductData(url);

    document.head.innerHTML = `
      <meta property="og:title" content="Walnut Lounge Chair" />
      <meta property="product:price:amount" content="2450.00" />
    `;
    document.body.innerHTML = images;
    const structured = await extractProductData(url);

    expect(structured.confidence).toBe('high');
    expect(bodyTextOnly.price?.value).toBe(245000);
    expect(bodyTextOnly.confidence).not.toBe('high');
  });
});

describe('currency on the extraction (CL-R13)', () => {
  it('carries the offer currency', async () => {
    setPage(`
      <script type="application/ld+json">
        {"@type":"Product","name":"Chair","offers":[
          {"@type":"Offer","price":250,"priceCurrency":"GBP"}
        ]}
      </script>
    `);

    const data = await extractProductData('https://example.co.uk/p/1');
    expect(data.currency).toBe('GBP');
  });

  it('defaults to USD when the page publishes no price', async () => {
    setPage('<h1>Harris Sofa</h1>');
    const data = await extractProductData('https://www.westelm.com/products/harris-sofa-96-h4614/');
    expect(data.price).toBeNull();
    expect(data.currency).toBe('USD');
  });
});
