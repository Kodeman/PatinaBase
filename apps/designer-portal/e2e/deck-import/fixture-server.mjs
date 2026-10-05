#!/usr/bin/env node
/**
 * Deck-import e2e fixture server (SQ-364). The edge functions reach it through
 * DECK_IMPORT_TEST_FETCH_BASE (supabase/functions/board-deck-import-resolve/
 * test_fetch_base.ts): a product URL https://<host>/<path> arrives here as
 * GET /<host>/<path>, and board-web-match's Vision call as
 * POST /vision/v1/images:annotate.
 *
 *   GET  /health          200 ok (Playwright's readiness probe)
 *   GET  /__log           every request seen since the last DELETE, as JSON
 *   DELETE /__log         clear the log
 *   GET  /img/<name>.png  a small product photo
 *   POST /vision/...      Web Detection: one retailer page with a full match
 *   GET  /<host>/<path>   a product page with a JSON-LD Product; the name comes
 *                         from the slug, the brand from the host, and the
 *                         price is fixed per path
 *
 * No dependencies. Port: DECK_FIXTURE_PORT (default 4599). It listens on all
 * interfaces because the edge runtime runs in Docker and calls in through
 * host.docker.internal.
 */
import http from 'node:http';
import zlib from 'node:zlib';

const PORT = Number(process.env.DECK_FIXTURE_PORT ?? 4599);
const PUBLIC_BASE = `http://127.0.0.1:${PORT}`;
const WEB_FOUND_URL = 'https://www.cb2.com/products/found-on-the-web-chair';

const BRANDS = {
  'rh.com': 'RH',
  'cb2.com': 'CB2',
  'westelm.com': 'West Elm',
  'article.com': 'Article',
  'lumens.com': 'Lumens',
  'flos.com': 'Flos',
  'wayfair.com': 'Wayfair',
  'rejuvenation.com': 'Rejuvenation',
  'schoolhouse.com': 'Schoolhouse',
  'burkedecor.com': 'Burke Decor',
  'studiodunn.com': 'Studio Dunn',
};

const log = [];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A solid 32x32 RGB PNG, tinted per name so pieces differ. */
function png(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [r, g, b] = [80 + (h % 120), 70 + ((h >> 8) % 110), 60 + ((h >> 16) % 100)];
  const size = 32;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set([r, g, b], y * (size * 3 + 1) + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function titleCase(slug) {
  return slug
    .replace(/\.[a-z]+$/i, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/** Deterministic USD price in cents for a path: 400.00–2,399.00. */
function fixturePriceCents(path) {
  let h = 7;
  for (const ch of path) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return (400 + (h % 2000)) * 100;
}

function productPage(host, path) {
  const bare = host.replace(/^www\./, '');
  const slug = path.split('/').filter(Boolean).pop() ?? 'piece';
  const name = titleCase(slug) || 'Piece';
  const brand = BRANDS[bare] ?? titleCase(bare.split('.')[0]);
  const price = (fixturePriceCents(`/${host}${path}`) / 100).toFixed(2);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    brand: { '@type': 'Brand', name: brand },
    sku: `FX-${slug.slice(0, 12).toUpperCase()}`,
    image: [`${PUBLIC_BASE}/img/${encodeURIComponent(slug)}.png`],
    offers: { '@type': 'Offer', price, priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
  };
  return `<!doctype html><html><head><title>${name} | ${brand}</title>
<meta property="og:type" content="product">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head><body><h1>${name}</h1></body></html>`;
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://fixture');
  const path = url.pathname;
  if (path === '/health') return send(res, 200, 'text/plain', 'ok');
  if (path === '/__log') {
    if (req.method === 'DELETE') log.length = 0;
    return send(res, 200, 'application/json', JSON.stringify(log));
  }
  log.push({ method: req.method, path, at: new Date().toISOString() });
  if (path.startsWith('/img/')) return send(res, 200, 'image/png', png(path));
  if (req.method === 'POST' && path === '/vision/v1/images:annotate') {
    req.resume();
    return send(res, 200, 'application/json', JSON.stringify({
      responses: [{
        webDetection: {
          pagesWithMatchingImages: [{
            url: WEB_FOUND_URL,
            pageTitle: 'Found On The Web Chair',
            fullMatchingImages: [{ url: `${PUBLIC_BASE}/img/found-on-the-web-chair.png` }],
          }],
        },
      }],
    }));
  }
  const [, host, ...rest] = path.split('/');
  if (req.method !== 'GET' || !host || !host.includes('.')) return send(res, 404, 'text/plain', 'not found');
  return send(res, 200, 'text/html; charset=utf-8', productPage(host, `/${rest.join('/')}`));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`deck fixture server on :${PORT}`);
});
