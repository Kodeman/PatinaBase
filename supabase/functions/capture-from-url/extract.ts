// capture-from-url · product extractor (PURE, no network).
//
// Given a page's HTML and its URL, pull the fields a Patina capture needs:
// name, brand, description, retail price (as integer cents), and images. Parsed
// in priority order:
//   1. Open Graph  — og:title / og:image / og:description + product:price:amount
//      (or og:price:amount) and product:brand.
//   2. JSON-LD     — <script type="application/ld+json"> with @type Product:
//      name, brand(.name), offers.price, image, description.
//   3. Fallback    — <title> heuristic + <meta name="description"|"brand">.
// Per field the first source that carries a value wins; a page with none yields
// an (almost) empty record (only sourceUrl set).
//
// Regex/string scanning only — no DOM, no npm deps. The returned shape mirrors
// `@patina/utils` `ExtractedProduct` (the portal's contract) exactly; it's
// redeclared here because the edge-function bundle can't reach the workspace
// package.

// deno-lint-ignore-file no-explicit-any

/** Mirrors `@patina/utils` `ExtractedProduct` — the wire contract. */
export interface ExtractedProduct {
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  priceRetailCents?: number | null;
  images?: string[];
  sourceUrl?: string | null;
}

// ─── Entities / attributes ────────────────────────────────────────────────────

function safeFromCodePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

/** Decode the HTML entities that show up in meta content / titles. Single-pass
 *  (entities aren't recursively decoded); `&amp;` is resolved LAST. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/** Read a single attribute from one tag's source; whitespace-anchored so
 *  `content=` never matches `data-content=`. Returns the decoded value. */
function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(
    '(?:\\s)' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))',
    'i',
  );
  const m = tag.match(re);
  if (!m) return null;
  const raw = m[2] ?? m[3] ?? m[4] ?? '';
  return decodeEntities(raw);
}

interface MetaTag {
  key: string;
  content: string;
}

function collectMetaTags(html: string): MetaTag[] {
  const tags: MetaTag[] = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = getAttr(tag, 'property') ?? getAttr(tag, 'name');
    const content = getAttr(tag, 'content');
    if (key && content !== null) {
      tags.push({ key: key.trim().toLowerCase(), content });
    }
  }
  return tags;
}

function metaFirst(tags: MetaTag[], keys: string[]): string | null {
  for (const k of keys) {
    const hit = tags.find((t) => t.key === k && t.content.trim() !== '');
    if (hit) return hit.content.trim();
  }
  return null;
}

function metaAll(tags: MetaTag[], keys: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    if (keys.includes(t.key) && t.content.trim() !== '') out.push(t.content.trim());
  }
  return out;
}

// ─── Price ────────────────────────────────────────────────────────────────────

/**
 * Parse a price to integer cents. US-centric: `,` is a thousands separator and
 * `.` the decimal point (OG/JSON-LD machine prices are `1234.56`; the comma
 * form appears only in human-readable meta/title text). A bare integer is
 * whole dollars. Returns null when nothing numeric is present.
 *   "$1,234.56" → 123456 · "1234" → 123400 · "99.99" → 9999 · "" → null
 */
export function parsePriceToCents(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  }
  const cleaned = String(raw).replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;
  const noThousands = cleaned.replace(/,/g, '');
  const value = Number(noThousands);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

function asString(v: any): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/** Depth-first search for a node whose @type is (or includes) "Product",
 *  descending into arrays and @graph. */
function findProductNode(node: any): any | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }
  const t = node['@type'];
  const isProduct = t === 'Product' || (Array.isArray(t) && t.includes('Product'));
  if (isProduct) return node;
  if (Array.isArray(node['@graph'])) return findProductNode(node['@graph']);
  return null;
}

function extractLdBrand(brand: any): string | null {
  if (!brand) return null;
  if (typeof brand === 'string') return brand;
  if (Array.isArray(brand)) return extractLdBrand(brand[0]);
  if (typeof brand === 'object') return asString(brand.name);
  return null;
}

function extractLdOfferPrice(offers: any): string | number | null {
  if (!offers) return null;
  if (Array.isArray(offers)) {
    for (const o of offers) {
      const p = extractLdOfferPrice(o);
      if (p != null) return p;
    }
    return null;
  }
  if (typeof offers === 'object') {
    if (offers.price != null) return offers.price as string | number;
    if (offers.priceSpecification) return extractLdOfferPrice(offers.priceSpecification);
    if (offers.lowPrice != null) return offers.lowPrice as string | number;
  }
  return null;
}

function extractLdImages(image: any): string[] {
  if (!image) return [];
  if (typeof image === 'string') return [image];
  if (Array.isArray(image)) {
    const out: string[] = [];
    for (const i of image) {
      if (typeof i === 'string') out.push(i);
      else if (i && typeof i === 'object' && typeof i.url === 'string') out.push(i.url);
    }
    return out;
  }
  if (typeof image === 'object' && typeof image.url === 'string') return [image.url];
  return [];
}

interface LdResult {
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  price?: string | number | null;
  images?: string[];
}

function extractJsonLd(html: string): LdResult {
  for (const m of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const text = m[1].trim();
    if (!text) continue;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    const node = findProductNode(data);
    if (!node) continue;
    return {
      name: asString(node.name),
      brand: extractLdBrand(node.brand),
      description: asString(node.description),
      price: extractLdOfferPrice(node.offers),
      images: extractLdImages(node.image),
    };
  }
  return {};
}

// ─── Open Graph + fallback ─────────────────────────────────────────────────────

interface OgResult {
  title: string | null;
  brand: string | null;
  description: string | null;
  price: string | null;
  images: string[];
}

function extractOpenGraph(tags: MetaTag[]): OgResult {
  return {
    title: metaFirst(tags, ['og:title']),
    brand: metaFirst(tags, ['product:brand', 'og:brand']),
    description: metaFirst(tags, ['og:description']),
    price: metaFirst(tags, ['product:price:amount', 'og:price:amount']),
    images: metaAll(tags, ['og:image', 'og:image:url', 'og:image:secure_url']),
  };
}

/** `<title>` name heuristic: strip a trailing "| Retailer"-style segment.
 *  Only strong separators (never a bare hyphen — product names use those). */
function titleName(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  let t = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (const sep of [' | ', ' — ', ' – ', ' · ', ' :: ']) {
    const idx = t.indexOf(sep);
    if (idx > 0) {
      t = t.slice(0, idx).trim();
      break;
    }
  }
  return t || null;
}

interface FallbackResult {
  title: string | null;
  brand: string | null;
  description: string | null;
}

function extractFallback(html: string, tags: MetaTag[]): FallbackResult {
  return {
    title: titleName(html),
    brand: metaFirst(tags, ['brand', 'author']),
    description: metaFirst(tags, ['description']),
  };
}

// ─── Combine ────────────────────────────────────────────────────────────────

function firstText(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

function firstNumber(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/** Resolve each src against `base`, drop unparseable, dedupe preserving order. */
function dedupeAbsolute(srcs: string[], base: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of srcs) {
    if (!src || src.trim() === '') continue;
    let abs: string;
    try {
      abs = new URL(src.trim(), base).toString();
    } catch {
      continue;
    }
    if (!seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
  }
  return out;
}

/** Extract a product record from page HTML. `url` is the page's (final) URL:
 *  it becomes `sourceUrl` and the base for resolving relative images. */
export function extractProduct(html: string, url: string): ExtractedProduct {
  const tags = collectMetaTags(html);
  const og = extractOpenGraph(tags);
  const ld = extractJsonLd(html);
  const fb = extractFallback(html, tags);

  const name = firstText(og.title, ld.name, fb.title);
  const brand = firstText(og.brand, ld.brand, fb.brand);
  const description = firstText(og.description, ld.description, fb.description);
  const priceRetailCents = firstNumber(
    parsePriceToCents(og.price),
    parsePriceToCents(ld.price ?? null),
  );
  const images = dedupeAbsolute([...og.images, ...(ld.images ?? [])], url);

  return {
    name: name ?? null,
    brand: brand ?? null,
    description: description ?? null,
    priceRetailCents: priceRetailCents ?? null,
    images,
    sourceUrl: url,
  };
}
