/**
 * CL-R1 — the SKU / model number the page publishes.
 *
 * Source-by-source coverage over hand-written documents, then the harvested
 * vendor fixtures (src/__tests__/fixtures) so the precedence is pinned to real
 * markup as well as to synthetic cases.
 */
import { describe, it, expect } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'fs';
import path from 'path';
import { extractSku } from '../../lib/extraction/metadata';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');
const PAGE_URL = 'https://shop.example.com/p/harris-sofa';

function docFrom(body: string, url = PAGE_URL): Document {
  return new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
    url,
    virtualConsole: new VirtualConsole(),
  }).window.document;
}

function jsonLd(payload: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;
}

function fixtureDoc(file: string, url: string): Document {
  const html = readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
  return new JSDOM(html, { url, virtualConsole: new VirtualConsole() }).window.document;
}

describe('extractSku — sources', () => {
  it('reads sku off a JSON-LD Product', () => {
    const doc = docFrom(jsonLd({ '@type': 'Product', name: 'Harris', sku: 'H4614' }));
    expect(extractSku(doc)).toBe('H4614');
  });

  it('reads a Product nested in an @graph', () => {
    const doc = docFrom(
      jsonLd({
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'WebPage' }, { '@type': 'Product', sku: 'GRAPH-1' }],
      })
    );
    expect(extractSku(doc)).toBe('GRAPH-1');
  });

  it('reads a Product whose @type is an array', () => {
    const doc = docFrom(jsonLd({ '@type': ['Product', 'IndividualProduct'], sku: 'ARR-1' }));
    expect(extractSku(doc)).toBe('ARR-1');
  });

  it('falls back to mpn when there is no sku', () => {
    const doc = docFrom(jsonLd({ '@type': 'Product', mpn: 'MPN-9' }));
    expect(extractSku(doc)).toBe('MPN-9');
  });

  it('falls back to productID, stripping a sku: prefix', () => {
    const doc = docFrom(jsonLd({ '@type': 'Product', productID: 'sku:12345' }));
    expect(extractSku(doc)).toBe('12345');
  });

  it('reads the OpenGraph product tag when no JSON-LD carries one', () => {
    const doc = docFrom('<meta property="product:retailer_item_id" content="OG-77" />');
    expect(extractSku(doc)).toBe('OG-77');
  });

  it('reads microdata content, then microdata text', () => {
    expect(extractSku(docFrom('<meta itemprop="sku" content="MICRO-1" />'))).toBe('MICRO-1');
    expect(extractSku(docFrom('<span itemprop="sku"> MICRO-2 </span>'))).toBe('MICRO-2');
  });

  it('returns null when the page publishes nothing', () => {
    expect(extractSku(docFrom('<h1>Harris Sofa</h1>'))).toBeNull();
  });
});

describe('extractSku — precedence', () => {
  it('prefers sku over mpn over productID on the same node', () => {
    const all = { '@type': 'Product', sku: 'S', mpn: 'M', productID: 'P' };
    expect(extractSku(docFrom(jsonLd(all)))).toBe('S');

    const { sku: _sku, ...noSku } = all;
    expect(extractSku(docFrom(jsonLd(noSku)))).toBe('M');

    const { mpn: _mpn, ...idOnly } = noSku;
    expect(extractSku(docFrom(jsonLd(idOnly)))).toBe('P');
  });

  it('prefers JSON-LD over the OpenGraph tag and microdata', () => {
    const doc = docFrom(
      jsonLd({ '@type': 'Product', sku: 'FROM-JSONLD' }) +
        '<meta property="product:retailer_item_id" content="FROM-OG" />' +
        '<meta itemprop="sku" content="FROM-MICRODATA" />'
    );
    expect(extractSku(doc)).toBe('FROM-JSONLD');
  });

  it('prefers the OpenGraph tag over microdata', () => {
    const doc = docFrom(
      '<meta property="product:retailer_item_id" content="FROM-OG" />' +
        '<meta itemprop="sku" content="FROM-MICRODATA" />'
    );
    expect(extractSku(doc)).toBe('FROM-OG');
  });

  it('takes the ProductGroup variant whose URL addresses this page', () => {
    const group = {
      '@type': 'ProductGroup',
      sku: 'GROUP',
      hasVariant: [
        { '@type': 'Product', sku: 'OTHER-SIZE', url: `${PAGE_URL}?sku=999` },
        { '@type': 'Product', sku: 'SELECTED', url: `${PAGE_URL}?sku=111` },
      ],
    };
    expect(extractSku(docFrom(jsonLd(group), `${PAGE_URL}?sku=111`))).toBe('SELECTED');
  });

  it('falls back to the group when no variant addresses this page', () => {
    const group = {
      '@type': 'ProductGroup',
      sku: 'GROUP',
      hasVariant: [
        { '@type': 'Product', sku: 'OTHER-SIZE', url: `${PAGE_URL}?sku=999` },
        { '@type': 'Product', sku: 'ANOTHER-SIZE', url: `${PAGE_URL}?sku=111` },
      ],
    };
    expect(extractSku(docFrom(jsonLd(group)))).toBe('GROUP');
  });

  it('never picks an unselected variant when the group names no sku', () => {
    const group = {
      '@type': 'ProductGroup',
      hasVariant: [{ '@type': 'Product', sku: 'OTHER-SIZE', url: `${PAGE_URL}?sku=999` }],
    };
    expect(extractSku(docFrom(jsonLd(group)))).toBeNull();
  });
});

describe('extractSku — shape', () => {
  it('trims surrounding whitespace', () => {
    const doc = docFrom(jsonLd({ '@type': 'Product', sku: '  H4614\n' }));
    expect(extractSku(doc)).toBe('H4614');
  });

  it('accepts a numeric sku', () => {
    const doc = docFrom(jsonLd({ '@type': 'Product', sku: 26982 }));
    expect(extractSku(doc)).toBe('26982');
  });

  it.each(['n/a', 'N/A', 'na', 'NA', 'null', 'NULL', 'undefined', 'Undefined', 'none', 'None', '-'])(
    'rejects the placeholder %s',
    (placeholder) => {
      expect(extractSku(docFrom(jsonLd({ '@type': 'Product', sku: placeholder })))).toBeNull();
    }
  );

  it('falls past a placeholder sku to a real mpn', () => {
    const doc = docFrom(jsonLd({ '@type': 'Product', sku: 'N/A', mpn: 'MPN-9' }));
    expect(extractSku(doc)).toBe('MPN-9');
  });

  it('accepts a 64-character sku but rejects anything longer', () => {
    const atCap = 'A'.repeat(64);
    expect(extractSku(docFrom(jsonLd({ '@type': 'Product', sku: atCap })))).toBe(atCap);
    expect(extractSku(docFrom(jsonLd({ '@type': 'Product', sku: 'A'.repeat(65) })))).toBeNull();
  });
});

// Which harvested fixtures publish a SKU, and from where. The three the brief
// names (Room & Board, DWR, Wayfair) are asserted alongside the other pages
// that yield one, so a regression in any single source shows up here.
describe('extractSku — harvested fixtures', () => {
  it('reads Room & Board from JSON-LD', () => {
    const doc = fixtureDoc(
      'roomandboard.com.stevens-sofas.html',
      'https://www.roomandboard.com/catalog/living/sofas-and-loveseats/stevens-sofas'
    );
    expect(extractSku(doc)).toBe('26982');
  });

  it('reads DWR from microdata', () => {
    const doc = fixtureDoc(
      'dwr.com.eames-lounge-chair-and-ottoman.html',
      'https://www.dwr.com/living-lounge-chairs/eames-lounge-chair-and-ottoman/5667.html?lang=en_US'
    );
    expect(extractSku(doc)).toBe('100077567');
  });

  it('finds nothing on Wayfair — the page publishes no sku/mpn/productID', () => {
    const doc = fixtureDoc(
      'wayfair.com.ebern-designs-sofa.html',
      'https://www.wayfair.com/furniture/pdp/ebern-designs-traditional-upholstered-standard-sofa-with-square-armrests-and-2-throw-pillows-w112266288.html'
    );
    expect(extractSku(doc)).toBeNull();
  });

  it('reads the other publishing fixtures', () => {
    expect(
      extractSku(
        fixtureDoc(
          'visualcomfort.com.talia-small-chandelier.html',
          'https://www.visualcomfort.com/us/p/talia-small-chandelier-jn5110'
        )
      )
    ).toBe('JN5110');

    expect(
      extractSku(
        fixtureDoc(
          'knoll.com.womb-chair.html',
          'https://www.knoll.com/shop/en_us/living-lounge-chairs/womb-chair/7876.html?sku=100360310'
        )
      )
    ).toBe('100360310');

    expect(
      extractSku(
        fixtureDoc('westelm.com.harris-sofa.html', 'https://www.westelm.com/products/harris-sofa-96-h4614/')
      )
    ).toBe('harris-sofa-96-h4614');

    expect(
      extractSku(
        fixtureDoc(
          'cb2.com.berkeley-velvet-sofa.html',
          'https://www.cb2.com/berkeley-78-jade-performance-velvet-sofa/s450191'
        )
      )
    ).toBe('450191');
  });
});
