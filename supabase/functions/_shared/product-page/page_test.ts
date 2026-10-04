// deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/product-page/
//
// Fixtures are hand-built in the shape public retailer pages use (no client
// data): the must-handle list from the SQ-349 hit-rate spike.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { cleanImageUrl, cleanProductName, readProductPage } from './page.ts';

function page(head: string): string {
  return `<!doctype html><html><head>${head}</head><body><h1>x</h1></body></html>`;
}

function ld(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}

Deno.test('(a) a redirect off the product path is not a product (category landing)', () => {
  const html = page(`<meta property="og:type" content="product">${ld({ '@type': 'Product', name: 'Lamp' })}`);
  const read = readProductPage(html, 'https://shop.example/product/brass-lamp-123', 'https://shop.example/lighting');
  assertEquals(read.kind, 'not_product');
  assertEquals(read.reason, 'left_product_path');
});

Deno.test('(a) og:type website with no product data is not a product (marketplace search page)', () => {
  const html = page(
    `<meta property="og:type" content="website"><meta property="og:title" content="Vintage Chairs | Market">`,
  );
  const read = readProductPage(html, 'https://market.example/shop/chairs', 'https://market.example/shop/chairs');
  assertEquals(read.kind, 'not_product');
  assertEquals(read.reason, 'og_type_not_product');
});

Deno.test('a page with neither JSON-LD Product nor an OG price gives no candidate', () => {
  const html = page(`<meta property="og:title" content="About us">`);
  const read = readProductPage(html, 'https://shop.example/about', 'https://shop.example/about');
  assertEquals(read.kind, 'not_product');
  assertEquals(read.reason, 'no_product_data');
});

Deno.test('(b) JSON-LD ProductGroup: price from hasVariant offers, brand from the group', () => {
  const html = page(ld({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: 'Shop' },
      {
        '@type': 'ProductGroup',
        name: 'Harmony Sofa',
        brand: { '@type': 'Brand', name: 'Example Home' },
        hasVariant: [
          { '@type': 'Product', sku: 'H-1', offers: { '@type': 'Offer', price: '2499.00', priceCurrency: 'USD' } },
          { '@type': 'Product', sku: 'H-2', offers: { '@type': 'Offer', price: '1999.00', priceCurrency: 'USD' } },
        ],
      },
    ],
  }));
  const read = readProductPage(html, 'https://shop.example/products/harmony-sofa', 'https://shop.example/products/harmony-sofa');
  assertEquals(read.kind, 'product');
  assertEquals(read.name, 'Harmony Sofa');
  assertEquals(read.brand, 'Example Home');
  assertEquals(read.priceCents, 199900);
});

Deno.test('(c) the LD name wins over og:title, and retailer tails are stripped', () => {
  const html = page(
    `<meta property="og:title" content="Oak Side Table - Tables - Example Home">` +
      `<meta property="og:site_name" content="Example Home">` +
      ld({ '@type': 'Product', name: 'Oak Side Table | Example Home', offers: { price: 300, priceCurrency: 'USD' } }),
  );
  const read = readProductPage(html, 'https://examplehome.com/p/oak-side-table', 'https://examplehome.com/p/oak-side-table');
  assertEquals(read.name, 'Oak Side Table');
  assertEquals(cleanProductName('Oak Side Table - Tables - Example Home', ['Example Home']), 'Oak Side Table');
  assertEquals(cleanProductName('Oak Side Table | Example Home', []), 'Oak Side Table');
  // A hyphen that is part of the name stays.
  assertEquals(cleanProductName('Mid-Century Chair', ['Example Home']), 'Mid-Century Chair');
});

Deno.test('(e) og:image http→https, deduped, CDN size params and Shopify suffix removed', () => {
  const html = page(
    `<meta property="og:image" content="http://cdn.shopify.com/s/files/1/sofa_800x800.jpg?v=1&width=800">` +
      `<meta property="og:image:secure_url" content="https://cdn.shopify.com/s/files/1/sofa.jpg?v=1">` +
      `<meta property="product:price:amount" content="1,299.00"><meta property="product:price:currency" content="USD">`,
  );
  const read = readProductPage(html, 'https://shop.example/products/sofa', 'https://shop.example/products/sofa');
  assertEquals(read.kind, 'product');
  assertEquals(read.images, ['https://cdn.shopify.com/s/files/1/sofa.jpg?v=1']);
  assertEquals(read.priceCents, 129900);
  assertEquals(
    cleanImageUrl('https://images.example.scene7.com/is/image/x/lamp?wid=400&hei=400&fmt=jpg', 'https://x.example/'),
    'https://images.example.scene7.com/is/image/x/lamp?fmt=jpg',
  );
  assertEquals(cleanImageUrl('/img/a.jpg', 'https://shop.example/p/1'), 'https://shop.example/img/a.jpg');
  assertEquals(cleanImageUrl('data:image/png;base64,AAAA', 'https://shop.example/'), null);
});

Deno.test('(f) a non-USD priceCurrency is no price, in JSON-LD and OG alike', () => {
  const ldHtml = page(ld({ '@type': 'Product', name: 'Chair', offers: { price: '450', priceCurrency: 'EUR' } }));
  const ldRead = readProductPage(ldHtml, 'https://eu.example/p/chair', 'https://eu.example/p/chair');
  assertEquals(ldRead.kind, 'product');
  assertEquals(ldRead.priceCents, null);

  const ogHtml = page(
    `<meta property="og:title" content="Chair"><meta property="product:price:amount" content="450">` +
      `<meta property="product:price:currency" content="GBP">`,
  );
  const ogRead = readProductPage(ogHtml, 'https://uk.example/p/chair', 'https://uk.example/p/chair');
  assertEquals(ogRead.kind, 'product');
  assertEquals(ogRead.priceCents, null);
});
