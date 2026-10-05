// product-page · strict product-page reading for deck links (PURE, no network).
//
// capture-from-url's `extractProduct` is permissive on purpose: a designer
// pasted the URL and is looking at the result. A link read off a deck is not
// looked at before it lands in her ledger, so a wrong page is worse than no
// page. `readProductPage` therefore accepts a page only when it carries a
// JSON-LD Product/ProductGroup or an Open Graph product price, and rejects the
// SQ-349 false-positive shapes:
//   (a) the final URL left the product path (a sold listing that redirects to
//       its category), or og:type says the page is not a product;
//   (b) JSON-LD ProductGroup: price from hasVariant[].offers, brand from the group;
//   (c) the LD name wins over og:title, with " | Retailer" and
//       " - Category - Retailer" tails stripped;
//   (e) og:image upgraded to https, deduped, CDN size params dropped;
//   (f) a priceCurrency other than USD is no price at all.
// (d), the larger HTML budget, is the caller's `fetchHtml(..., { maxBytes })`.

// deno-lint-ignore-file no-explicit-any

import {
  decodeEntities,
  elementBodies,
  isLdJsonTag,
  parsePriceToCents,
  tagSources,
} from './extract.ts';

export interface ProductPageRead {
  kind: 'product' | 'not_product';
  /** Why a page was not accepted as a product. */
  reason?: 'left_product_path' | 'og_type_not_product' | 'no_product_data';
  name: string | null;
  brand: string | null;
  priceCents: number | null;
  sku: string | null;
  images: string[];
  sourceUrl: string;
  hasLdProduct: boolean;
  hasOgPrice: boolean;
}

/** The deck-link page budget: real product pages run past capture's 2MB. */
export const DECK_PAGE_MAX_BYTES = 5 * 1024 * 1024;

function metaMap(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of tagSources(html, '<meta\\b')) {
    const key = attr(tag, 'property') ?? attr(tag, 'name');
    const content = attr(tag, 'content');
    if (!key || content === null || !content.trim()) continue;
    const k = key.trim().toLowerCase();
    if (!out.has(k)) out.set(k, content.trim());
  }
  return out;
}

function metaAll(html: string, keys: string[]): string[] {
  const out: string[] = [];
  for (const tag of tagSources(html, '<meta\\b')) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name'))?.trim().toLowerCase();
    const content = attr(tag, 'content');
    if (key && keys.includes(key) && content && content.trim()) out.push(content.trim());
  }
  return out;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(
    new RegExp('(?:\\s)' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i'),
  );
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
}

function text(v: any): string | null {
  if (typeof v === 'string' && v.trim()) return decodeEntities(v.trim());
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function typesOf(node: any): string[] {
  const t = node?.['@type'];
  return Array.isArray(t) ? t.filter((x) => typeof x === 'string') : typeof t === 'string' ? [t] : [];
}

/** Depth-first: the first Product or ProductGroup node, through arrays and @graph. */
function findProductLike(node: any): any | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findProductLike(item);
      if (hit) return hit;
    }
    return null;
  }
  const types = typesOf(node);
  if (types.includes('Product') || types.includes('ProductGroup')) return node;
  if (Array.isArray(node['@graph'])) return findProductLike(node['@graph']);
  return null;
}

function brandOf(brand: any): string | null {
  if (!brand) return null;
  if (Array.isArray(brand)) return brandOf(brand[0]);
  if (typeof brand === 'object') return text(brand.name);
  return text(brand);
}

interface Offer {
  price: number | null;
  currency: string | null;
}

function offersOf(offers: any): Offer[] {
  if (!offers) return [];
  if (Array.isArray(offers)) return offers.flatMap(offersOf);
  if (typeof offers !== 'object') return [];
  const currency = text(offers.priceCurrency)?.toUpperCase() ?? null;
  const raw = offers.price ?? offers.lowPrice ?? null;
  if (raw == null && offers.priceSpecification) {
    return offersOf(offers.priceSpecification).map((o) => ({
      price: o.price,
      currency: o.currency ?? currency,
    }));
  }
  if (raw == null && Array.isArray(offers.offers)) return offersOf(offers.offers);
  return [{ price: parsePriceToCents(raw), currency }];
}

/** Lowest USD price; a non-USD currency is no price (rule f). */
function usdPrice(offers: Offer[]): number | null {
  const usd = offers
    .filter((o) => o.price != null && o.price > 0 && (o.currency == null || o.currency === 'USD'))
    .map((o) => o.price as number);
  return usd.length ? Math.min(...usd) : null;
}

/** A hostile page can list a million images; cap before any URL parsing. */
const MAX_LD_IMAGES = 20;

function imagesOf(image: any, out: string[] = []): string[] {
  if (!image || out.length >= MAX_LD_IMAGES) return out;
  if (typeof image === 'string') out.push(image);
  else if (Array.isArray(image)) {
    for (const i of image) {
      if (out.length >= MAX_LD_IMAGES) break;
      imagesOf(i, out);
    }
  } else if (typeof image === 'object' && typeof image.url === 'string') out.push(image.url);
  else if (typeof image === 'object' && typeof image.contentUrl === 'string') {
    out.push(image.contentUrl);
  }
  return out;
}

interface LdProduct {
  name: string | null;
  brand: string | null;
  priceCents: number | null;
  sku: string | null;
  images: string[];
}

function readLd(html: string): LdProduct | null {
  for (const body of elementBodies(html, '<script\\b', 'script', isLdJsonTag)) {
    let data: unknown;
    try {
      data = JSON.parse(body.trim());
    } catch {
      continue;
    }
    const node = findProductLike(data);
    if (!node) continue;
    const variants: any[] = Array.isArray(node.hasVariant) ? node.hasVariant : [];
    const offers = [
      ...offersOf(node.offers),
      ...variants.flatMap((variant) => offersOf(variant?.offers)),
    ];
    return {
      name: text(node.name),
      brand: brandOf(node.brand) ?? variants.map((v) => brandOf(v?.brand)).find(Boolean) ?? null,
      priceCents: usdPrice(offers),
      sku: text(node.sku) ?? text(node.mpn) ?? null,
      images: variants.reduce((out, v) => imagesOf(v?.image, out), imagesOf(node.image)),
    };
  }
  return null;
}

/** Rule (c): drop " | Retailer" and " - Category - Retailer" tails. */
export function cleanProductName(raw: string | null, siteNames: string[]): string | null {
  if (!raw) return null;
  let name = raw.replace(/\s+/g, ' ').trim();
  for (const sep of [' | ', ' — ', ' – ', ' :: ']) {
    const idx = name.indexOf(sep);
    if (idx > 0) name = name.slice(0, idx).trim();
  }
  const sites = siteNames.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const parts = name.split(' - ');
  if (parts.length >= 2 && sites.includes(parts[parts.length - 1].trim().toLowerCase())) {
    parts.pop();
    // " - Category - Retailer": the segment before the retailer is a category.
    if (parts.length >= 2) parts.pop();
    name = parts.join(' - ').trim();
  }
  return name || null;
}

const CDN_SIZE_PARAMS = ['width', 'height', 'w', 'h', 'wid', 'hei', 'size', 'resize'];

/** Rule (e): https, no CDN size params, Shopify size suffix removed. */
export function cleanImageUrl(raw: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  const isCdn = host.endsWith('shopify.com') || host.endsWith('scene7.com') ||
    host.endsWith('ctfassets.net') || host.endsWith('imgix.net') || host.includes('cloudinary');
  if (isCdn) {
    for (const p of CDN_SIZE_PARAMS) url.searchParams.delete(p);
    url.pathname = url.pathname.replace(/_(\d+x\d*|\d*x\d+)(?=\.[a-z]+$)/i, '');
  }
  return url.toString();
}

function pathSegments(u: URL): string[] {
  return u.pathname.split('/').filter(Boolean);
}

/** Rule (a): a redirect that lands on a shorter path left the product. */
function leftProductPath(requestedUrl: string, finalUrl: string): boolean {
  let requested: URL;
  let final: URL;
  try {
    requested = new URL(requestedUrl);
    final = new URL(finalUrl);
  } catch {
    return false;
  }
  const a = pathSegments(requested);
  const b = pathSegments(final);
  if (a.join('/').toLowerCase() === b.join('/').toLowerCase()) return false;
  return b.length === 0 || b.length < a.length;
}

const PRODUCT_OG_TYPES = new Set(['product', 'product.item', 'og:product', 'product.group']);

export function readProductPage(
  html: string,
  requestedUrl: string,
  finalUrl: string,
): ProductPageRead {
  const meta = metaMap(html);
  const ld = readLd(html);
  const ogType = meta.get('og:type')?.toLowerCase() ?? null;
  const ogCurrency = (meta.get('product:price:currency') ?? meta.get('og:price:currency'))
    ?.toUpperCase() ?? null;
  const ogPriceRaw = meta.get('product:price:amount') ?? meta.get('og:price:amount') ?? null;
  const ogPrice = ogPriceRaw && (ogCurrency == null || ogCurrency === 'USD')
    ? parsePriceToCents(ogPriceRaw)
    : null;
  const hasOgPrice = ogPriceRaw != null;

  const base: ProductPageRead = {
    kind: 'not_product',
    name: null,
    brand: null,
    priceCents: null,
    sku: null,
    images: [],
    sourceUrl: finalUrl,
    hasLdProduct: ld != null,
    hasOgPrice,
  };
  if (leftProductPath(requestedUrl, finalUrl)) return { ...base, reason: 'left_product_path' };
  if (ogType && !PRODUCT_OG_TYPES.has(ogType) && !ld) {
    return { ...base, reason: 'og_type_not_product' };
  }
  if (!ld && !hasOgPrice) return { ...base, reason: 'no_product_data' };

  let host = '';
  try {
    host = new URL(finalUrl).hostname.replace(/^www\./, '');
  } catch { /* finalUrl came from fetchHtml and parses */ }
  const siteNames = [meta.get('og:site_name') ?? '', host, host.split('.')[0]];
  const firstTitle = elementBodies(html, '<title', 'title').next();
  const titleTag = firstTitle.done ? null : firstTitle.value;
  const name = cleanProductName(ld?.name ?? null, siteNames) ??
    cleanProductName(meta.get('og:title') ?? null, siteNames) ??
    cleanProductName(titleTag ? decodeEntities(titleTag) : null, siteNames);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const raw of [
    ...metaAll(html, ['og:image:secure_url', 'og:image', 'og:image:url']),
    ...(ld?.images ?? []),
  ]) {
    const clean = cleanImageUrl(raw, finalUrl);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      images.push(clean);
    }
  }

  return {
    ...base,
    kind: 'product',
    name,
    brand: ld?.brand ?? meta.get('product:brand') ?? meta.get('og:brand') ?? null,
    priceCents: ld?.priceCents ?? ogPrice ?? null,
    sku: ld?.sku ?? null,
    images,
  };
}
