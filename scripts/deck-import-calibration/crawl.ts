/// <reference lib="deno.ns" />
// SQ-362 calibration · step 1: the retailer catalog and query set (local only).
//
//   deno run -A scripts/deck-import-calibration/crawl.ts
//
// For each public Shopify home retailer below: list products from
// /products.json (gallery = every product image), read each product page
// through the _shared/product-page extractor (readProductPage: JSON-LD + og
// images, the same reader the resolver and capture use) and keep products
// whose extractor images AND gallery leave at least one alternate shot.
//
// Output (never committed — images and retailer copy stay out of the repo):
//   $CAL_DIR/catalog.json   [{key, domain, category, name, catalog_images[],
//                             alt_images[], role: 'catalog'|'negative'}]
//   $CAL_DIR/img/<sha>.bin  the downloaded source pictures for queries
// CAL_DIR defaults to ~/patina-deck-samples/calibration.

import { readProductPage } from '../../supabase/functions/_shared/product-page/page.ts';

const HOME = Deno.env.get('HOME') ?? '.';
export const CAL_DIR = Deno.env.get('CAL_DIR') ?? `${HOME}/patina-deck-samples/calibration`;

const RETAILERS = [
  'www.burrow.com',
  'www.luluandgeorgia.com',
  'floydhome.com',
  'www.schoolhouse.com',
  'www.parachutehome.com',
  'mcgeeandco.com',
  'www.sixpenny.com',
];
const PER_RETAILER = Number(Deno.env.get('PER_RETAILER') ?? 80);
/** Every NEGATIVE_EVERY-th kept product is held out of the catalog. */
const NEGATIVE_EVERY = 6;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const SKIP_TYPES = /gift ?card|sample|swatch|warranty|protection|fee|bundle|set of|kit/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, accept = 'text/html'): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept }, redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) {
        await res.body?.cancel();
        await sleep(2_000 * (attempt + 1));
        continue;
      }
      return res;
    } catch {
      await sleep(1_000 * (attempt + 1));
    }
  }
  return null;
}

/** The picture identity across CDN size variants: path without query. */
export function pictureKey(url: string): string {
  try {
    const u = new URL(url, 'https://x.invalid');
    return u.pathname.replace(/_(\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande|master)(?=\.)/i, '')
      .toLowerCase();
  } catch {
    return url;
  }
}

async function sha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

/** Shopify CDN: ask for a deck-ish size so downloads stay small. */
function sized(url: string, width = 1600): string {
  const abs = url.startsWith('//') ? `https:${url}` : url;
  try {
    const u = new URL(abs);
    if (u.hostname.includes('shopify') || u.pathname.includes('/cdn/shop/')) u.searchParams.set('width', String(width));
    return u.toString();
  } catch {
    return abs;
  }
}

async function download(url: string): Promise<string | null> {
  const key = await sha(url);
  const path = `${CAL_DIR}/img/${key}.bin`;
  try {
    await Deno.stat(path);
    return key;
  } catch { /* fetch */ }
  const res = await get(sized(url), 'image/avif,image/webp,image/png,image/jpeg,*/*');
  if (!res || !res.ok) {
    await res?.body?.cancel();
    return null;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 2_000) return null;
  await Deno.writeFile(path, bytes);
  return key;
}

interface ShopifyProduct {
  handle: string;
  title: string;
  product_type: string;
  images: { src: string }[];
}

export interface CatalogEntry {
  key: string;
  domain: string;
  category: string | null;
  name: string;
  /** Extractor images (the worker embeds the first 3). */
  catalog_images: string[];
  /** Gallery shots that are not among the embedded pictures. */
  alt_images: { url: string; file: string }[];
  /** The first embedded picture, downloaded (same-picture queries). */
  hero_file: string | null;
  role: 'catalog' | 'negative';
}

async function crawlRetailer(domain: string): Promise<CatalogEntry[]> {
  const out: CatalogEntry[] = [];
  const seen = new Set<string>();
  const seenPictures = new Set<string>();
  for (let page = 1; page <= 6 && out.length < PER_RETAILER; page++) {
    const res = await get(`https://${domain}/products.json?limit=250&page=${page}`, 'application/json');
    if (!res || !res.ok) break;
    const { products } = await res.json() as { products: ShopifyProduct[] };
    if (!products?.length) break;
    for (const product of products) {
      if (out.length >= PER_RETAILER) break;
      if (SKIP_TYPES.test(`${product.product_type} ${product.title}`)) continue;
      if ((product.images?.length ?? 0) < 4) continue;
      // Colourways are often listed as separate products with the same
      // pictures or the same leading words: keep one per family so the
      // ground truth is not ambiguous.
      const titleKey = product.title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
        .slice(0, 2).join(' ');
      if (seen.has(titleKey)) continue;
      seen.add(titleKey);
      const url = `https://${domain}/products/${product.handle}`;
      const pageRes = await get(url);
      await sleep(700);
      if (!pageRes || !pageRes.ok) {
        await pageRes?.body?.cancel();
        continue;
      }
      const html = await pageRes.text();
      const read = readProductPage(html, url, pageRes.url || url);
      if (read.kind !== 'product' || read.images.length === 0) continue;
      const embedded = read.images.slice(0, 3);
      const embeddedKeys = new Set(embedded.map(pictureKey));
      if (seenPictures.has(pictureKey(embedded[0]))) continue;
      seenPictures.add(pictureKey(embedded[0]));
      const alts = product.images
        .map((image) => (image.src.startsWith('//') ? `https:${image.src}` : image.src))
        .filter((src) => !embeddedKeys.has(pictureKey(src)));
      if (alts.length === 0) continue;
      // Two alternates at most: one near the hero (studio angle), one late
      // in the gallery (often the room scene).
      const picks = alts.length === 1 ? alts : [alts[0], alts[alts.length - 1]];
      const altFiles: { url: string; file: string }[] = [];
      for (const pick of picks) {
        const file = await download(pick);
        if (file) altFiles.push({ url: pick, file });
      }
      if (altFiles.length === 0) continue;
      const hero = await download(embedded[0]);
      out.push({
        key: await sha(url),
        domain,
        category: product.product_type?.trim() || null,
        name: read.name ?? product.title,
        catalog_images: embedded,
        alt_images: altFiles,
        hero_file: hero,
        role: (out.length + 1) % NEGATIVE_EVERY === 0 ? 'negative' : 'catalog',
      });
    }
  }
  console.log(`${domain}: ${out.length}`);
  return out;
}

if (import.meta.main) {
  await Deno.mkdir(`${CAL_DIR}/img`, { recursive: true });
  const results = await Promise.all(RETAILERS.map((domain) => crawlRetailer(domain)));
  const catalog = results.flat();
  await Deno.writeTextFile(`${CAL_DIR}/catalog.json`, JSON.stringify(catalog, null, 1));
  const negatives = catalog.filter((c) => c.role === 'negative').length;
  console.log(`kept ${catalog.length} products (${catalog.length - negatives} catalog, ${negatives} held out)`);
}
