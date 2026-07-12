// catalog-normalizer/normalize-row.ts — pure normalization: deterministic
// field parsers (dimensions, currency, materials/finishes vocabulary,
// freight-class heuristic, lead time) + the vector math used for category
// classification and dedupe similarity. No I/O — the inference HTTP call and
// DB reads live in core.ts; this module only shapes/scores data it's handed.

// ─── Row shape ────────────────────────────────────────────────────────────

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
  unit: 'in' | 'cm';
}

export interface NormalizedFields {
  name: string;
  description: string | null;
  vendor_sku: string | null;
  price_retail_cents: number | null;
  price_trade_cents: number | null;
  dimensions: Dimensions | null;
  materials: string[];
  finishes: string[];
  freight_class: string | null;
  lead_time_weeks: number | null;
  source_url: string | null;
  images: string[];
}

export type DeterministicResult =
  | { ok: true; value: NormalizedFields; fieldConfidence: Record<string, number> }
  | { ok: false; error: string };

// ─── Column-name aliasing ────────────────────────────────────────────────────
// Feeds are hand-authored by vendors; tolerate the common header spellings
// rather than demanding one canonical schema.

function pick(raw: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    // Case-insensitive, whitespace/underscore-insensitive match.
    const norm = k.toLowerCase().replace(/[\s_-]/g, '');
    for (const [rk, rv] of Object.entries(raw)) {
      if (rk.toLowerCase().replace(/[\s_-]/g, '') === norm && rv != null && rv !== '') {
        return rv;
      }
    }
  }
  return '';
}

// ─── Currency parsing ─────────────────────────────────────────────────────

/**
 * Parse a price string into integer cents. A clean single value (optional
 * `$`, thousands separators, optional cents) parses at full confidence. When
 * the string contains more than one numeric token (a range, "or best offer",
 * a second currency figure) the FIRST token is used as the value but
 * confidence drops — the row is genuinely ambiguous, not just differently
 * formatted.
 */
export function parseCurrency(input: string): { cents: number | null; confidence: number } {
  const s = input.trim();
  if (!s) return { cents: null, confidence: 0 };

  const matches = s.match(/\d[\d,]*(?:\.\d{1,2})?/g);
  if (!matches || matches.length === 0) return { cents: null, confidence: 0 };

  const first = matches[0].replace(/,/g, '');
  const value = Number(first);
  if (!Number.isFinite(value)) return { cents: null, confidence: 0 };
  const cents = Math.round(value * 100);

  if (matches.length > 1) {
    // Multiple numeric tokens: a range or extra qualifier. Take the first,
    // but this needs human eyes.
    return { cents, confidence: 0.4 };
  }

  // Single token. Full confidence if the string is basically just the
  // number plus optional currency symbol/whitespace/"USD" suffix.
  const stripped = s.replace(/[$,]/g, '').replace(/\busd\b/i, '').trim();
  if (stripped === first || stripped === value.toFixed(2)) {
    return { cents, confidence: 1.0 };
  }
  // Extra text around a single number (e.g. "$1,299.00 MSRP") — still
  // reasonably trustworthy but flag it below full confidence.
  return { cents, confidence: 0.75 };
}

// ─── Dimension parsing ────────────────────────────────────────────────────

const UNIT_ALIASES: Record<string, 'in' | 'cm'> = {
  '"': 'in',
  in: 'in',
  inch: 'in',
  inches: 'in',
  cm: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
};

/**
 * Parse a dimension string. Recognizes the labeled form
 * `24"W x 30"H x 20"D` (any order, optional unit token per segment) at full
 * confidence. Falls back to three bare numbers ("24 x 30 x 20", no labels,
 * no unit) at reduced confidence, assuming W x H x D order and defaulting to
 * inches. Prose ("about two feet wide") matches neither pattern and returns
 * null at zero confidence.
 */
export function parseDimensions(input: string): { value: Dimensions | null; confidence: number } {
  const s = input.trim();
  if (!s) return { value: null, confidence: 0 };

  // Labeled form: number + optional unit + W/H/D label, in any order,
  // joined by "x"/"X"/"×".
  const labeledRe =
    /(\d+(?:\.\d+)?)\s*("|in(?:ches)?|cm)?\s*([whd])/gi;
  const labeled: Partial<Record<'w' | 'h' | 'd', number>> = {};
  let unit: 'in' | 'cm' | null = null;
  let labeledCount = 0;
  for (const m of s.matchAll(labeledRe)) {
    const num = Number(m[1]);
    const u = m[2] ? UNIT_ALIASES[m[2].toLowerCase()] : undefined;
    const label = m[3].toLowerCase() as 'w' | 'h' | 'd';
    if (!Number.isFinite(num)) continue;
    labeled[label] = num;
    if (u) unit = u;
    labeledCount++;
  }
  if (labeledCount >= 3 && labeled.w != null && labeled.h != null && labeled.d != null) {
    return {
      value: { width: labeled.w, height: labeled.h, depth: labeled.d, unit: unit ?? 'in' },
      confidence: unit ? 1.0 : 0.85, // labeled but no explicit unit token — assume inches
    };
  }

  // Bare "24 x 30 x 20" (optionally with a trailing unit word/quote applying
  // to the whole triplet) — assume W x H x D order. No explicit per-segment
  // label, so this is a materially weaker read even when a unit is present.
  const bareRe = /(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*("|in(?:ches)?|cm)?/i;
  const bm = s.match(bareRe);
  if (bm) {
    const [, w, h, d, u] = bm;
    const parsedUnit = u ? UNIT_ALIASES[u.toLowerCase()] : undefined;
    return {
      value: {
        width: Number(w),
        height: Number(h),
        depth: Number(d),
        unit: parsedUnit ?? 'in',
      },
      confidence: parsedUnit ? 0.6 : 0.5, // ambiguous: no W/H/D labels, unit missing/assumed
    };
  }

  // Prose or otherwise unparseable.
  return { value: null, confidence: 0 };
}

// ─── Materials / finishes vocabulary ──────────────────────────────────────

export const MATERIAL_VOCABULARY = [
  'oak', 'walnut', 'maple', 'ash', 'pine', 'mahogany', 'teak', 'birch',
  'leather', 'linen', 'velvet', 'cotton', 'wool', 'boucle', 'chenille',
  'brass', 'steel', 'iron', 'aluminum', 'chrome', 'bronze',
  'marble', 'granite', 'travertine', 'concrete', 'glass', 'rattan', 'wicker', 'ceramic',
];

export const FINISH_VOCABULARY = [
  'walnut veneer', 'brushed brass', 'brushed nickel', 'matte black', 'polished chrome',
  'antique bronze', 'natural oak', 'weathered gray', 'high gloss', 'satin', 'lacquer',
  'powder coat', 'hand-rubbed', 'distressed', 'whitewash', 'ebonized',
];

/** Case-insensitive substring match of a vocabulary list against free text. */
export function matchVocabulary(text: string, vocabulary: string[]): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const term of vocabulary) {
    if (lower.includes(term.toLowerCase())) hits.push(term);
  }
  return hits;
}

// ─── Freight class heuristic ──────────────────────────────────────────────

/**
 * Rough NMFC-style freight-class bucket from density (lbs/ft³). This is a
 * heuristic for triage, not a carrier-authoritative lookup — it exists so
 * procurement has a starting freight_class rather than none.
 */
export function freightClassFromDensity(weightLbs: number, dims: Dimensions): string | null {
  if (!Number.isFinite(weightLbs) || weightLbs <= 0) return null;
  const { width, height, depth, unit } = dims;
  if (![width, height, depth].every((n) => Number.isFinite(n) && n > 0)) return null;

  const toInches = unit === 'cm' ? 0.393701 : 1;
  const wIn = width * toInches;
  const hIn = height * toInches;
  const dIn = depth * toInches;
  const cubicFeet = (wIn * hIn * dIn) / 1728;
  if (cubicFeet <= 0) return null;

  const density = weightLbs / cubicFeet;
  if (density >= 50) return 'class-50';
  if (density >= 35) return 'class-55';
  if (density >= 30) return 'class-60';
  if (density >= 22.5) return 'class-65';
  if (density >= 15) return 'class-70';
  if (density >= 12) return 'class-77.5';
  if (density >= 10) return 'class-85';
  if (density >= 8) return 'class-92.5';
  if (density >= 6) return 'class-100';
  if (density >= 4) return 'class-125';
  if (density >= 2) return 'class-150';
  return 'class-300';
}

// ─── Lead time parsing ─────────────────────────────────────────────────────

/** Parse "8 weeks", "6-8 weeks" (takes the upper bound), "10 wks". */
export function parseLeadTimeWeeks(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const range = s.match(/(\d+)\s*-\s*(\d+)\s*(?:weeks?|wks?)/);
  if (range) return Number(range[2]);
  const single = s.match(/(\d+)\s*(?:weeks?|wks?)/);
  if (single) return Number(single[1]);
  return null;
}

// ─── Deterministic normalize (name, price, dimensions, materials, ...) ─────

const NAME_KEYS = ['name', 'product name', 'title', 'product_name'];
const DESCRIPTION_KEYS = ['description', 'desc', 'details'];
const SKU_KEYS = ['sku', 'vendor sku', 'vendor_sku', 'part number', 'part_number', 'item number'];
const PRICE_RETAIL_KEYS = ['price', 'retail price', 'price_retail', 'msrp', 'list price'];
const PRICE_TRADE_KEYS = ['trade price', 'price_trade', 'wholesale price', 'dealer price'];
const DIMENSIONS_KEYS = ['dimensions', 'size', 'dims'];
const MATERIALS_KEYS = ['materials', 'material'];
const FINISHES_KEYS = ['finish', 'finishes'];
const WEIGHT_KEYS = ['weight', 'weight_lbs', 'weight (lbs)'];
const LEAD_TIME_KEYS = ['lead time', 'lead_time', 'lead time weeks'];
const SOURCE_URL_KEYS = ['url', 'source_url', 'source url', 'product url', 'link'];
const IMAGES_KEYS = ['image', 'images', 'image url', 'image_url'];

/**
 * Deterministic (non-ML) normalization for one raw row. Fails hard only on a
 * missing/blank name — nothing downstream can create or match a product
 * without one, so the row is unprocessable rather than merely low-confidence.
 */
export function normalizeRowDeterministic(raw: Record<string, string>): DeterministicResult {
  const name = pick(raw, NAME_KEYS).trim();
  if (!name) {
    return { ok: false, error: 'missing required field: name' };
  }

  const priceStr = pick(raw, PRICE_RETAIL_KEYS);
  const priceRes = parseCurrency(priceStr);

  const priceTradeStr = pick(raw, PRICE_TRADE_KEYS);
  const priceTradeRes = priceTradeStr ? parseCurrency(priceTradeStr) : { cents: null, confidence: 1 };

  const dimsStr = pick(raw, DIMENSIONS_KEYS);
  const dimsRes = parseDimensions(dimsStr);

  const materialsStr = pick(raw, MATERIALS_KEYS);
  const finishesStr = pick(raw, FINISHES_KEYS);
  const combinedForVocab = `${materialsStr} ${finishesStr}`;
  const materials = matchVocabulary(combinedForVocab || materialsStr, MATERIAL_VOCABULARY);
  const finishes = matchVocabulary(combinedForVocab || finishesStr, FINISH_VOCABULARY);

  const weightStr = pick(raw, WEIGHT_KEYS);
  const weight = weightStr ? Number(weightStr.replace(/[^\d.]/g, '')) : NaN;
  const freightClass =
    dimsRes.value && Number.isFinite(weight) && weight > 0
      ? freightClassFromDensity(weight, dimsRes.value)
      : null;

  const leadTimeWeeks = parseLeadTimeWeeks(pick(raw, LEAD_TIME_KEYS));

  const sourceUrl = pick(raw, SOURCE_URL_KEYS) || null;
  const imagesStr = pick(raw, IMAGES_KEYS);
  const images = imagesStr
    ? imagesStr.split(/[|,]/).map((s) => s.trim()).filter(Boolean)
    : [];

  const value: NormalizedFields = {
    name,
    description: pick(raw, DESCRIPTION_KEYS) || null,
    vendor_sku: pick(raw, SKU_KEYS) || null,
    price_retail_cents: priceRes.cents,
    price_trade_cents: priceTradeRes.cents,
    dimensions: dimsRes.value,
    materials,
    finishes,
    freight_class: freightClass,
    lead_time_weeks: leadTimeWeeks,
    source_url: sourceUrl,
    images,
  };

  const fieldConfidence: Record<string, number> = {
    name: 1.0,
    price: priceRes.confidence,
    dimensions: dimsRes.confidence,
  };

  return { ok: true, value, fieldConfidence };
}

// ─── Vector math (category classification + dedupe similarity) ────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface TaxonomyEntry {
  category: string;
  subcategory: string;
  label: string; // the text embedded to represent this leaf
}

/** A modest starter taxonomy — extend as vendor feeds reveal gaps. */
export const CATALOG_TAXONOMY: TaxonomyEntry[] = [
  { category: 'seating', subcategory: 'sofas', label: 'Sofa or sectional seating' },
  { category: 'seating', subcategory: 'chairs', label: 'Accent chair or armchair' },
  { category: 'seating', subcategory: 'dining-chairs', label: 'Dining chair' },
  { category: 'tables', subcategory: 'dining-tables', label: 'Dining table' },
  { category: 'tables', subcategory: 'coffee-tables', label: 'Coffee table or cocktail table' },
  { category: 'tables', subcategory: 'side-tables', label: 'Side table or end table' },
  { category: 'lighting', subcategory: 'pendants', label: 'Pendant light or chandelier' },
  { category: 'lighting', subcategory: 'lamps', label: 'Table lamp or floor lamp' },
  { category: 'storage', subcategory: 'cabinets', label: 'Cabinet or sideboard or credenza' },
  { category: 'storage', subcategory: 'shelving', label: 'Bookshelf or shelving unit' },
  { category: 'textiles', subcategory: 'rugs', label: 'Area rug or carpet' },
  { category: 'textiles', subcategory: 'pillows', label: 'Throw pillow or cushion' },
  { category: 'decor', subcategory: 'mirrors', label: 'Wall mirror or decorative mirror' },
  { category: 'decor', subcategory: 'art', label: 'Wall art or sculpture' },
  { category: 'outdoor', subcategory: 'outdoor-furniture', label: 'Outdoor or patio furniture' },
];

export interface CategoryClassification {
  category: string | null;
  subcategory: string | null;
  confidence: number;
}

/** Argmax cosine similarity of a row vector against the taxonomy embeddings. */
export function classifyCategory(
  rowVector: number[] | undefined,
  taxonomyVectors: Map<string, number[]>, // key = `${category}::${subcategory}`
): CategoryClassification {
  if (!rowVector) return { category: null, subcategory: null, confidence: 0 };
  let best: { key: string; sim: number } | null = null;
  for (const [key, vec] of taxonomyVectors) {
    const sim = cosineSimilarity(rowVector, vec);
    if (!best || sim > best.sim) best = { key, sim };
  }
  if (!best) return { category: null, subcategory: null, confidence: 0 };
  const [category, subcategory] = best.key.split('::');
  // Cosine similarity of a real embedding model rarely approaches 1.0 even
  // for a clean match; clamp into [0,1] and let the caller's >=0.9 auto
  // threshold do its job on the resulting confidence, not the raw score.
  return { category, subcategory, confidence: Math.max(0, Math.min(1, best.sim)) };
}

// ─── Field-level diff (for action='update' rows) ──────────────────────────

export interface ExistingProductFields {
  name: string;
  description: string | null;
  vendor_sku: string | null;
  price_retail: number | null;
  price_trade: number | null;
  dimensions: Dimensions | null;
  materials: string[] | null;
  finishes: string[] | null;
  freight_class: string | null;
  lead_time_weeks: number | null;
  category: string | null;
}

export interface DiffEntry {
  old: unknown;
  new: unknown;
  confidence: number;
}

function differs(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

/**
 * Compare an existing catalog product's fields against a normalized feed row
 * and return only the fields that changed, each carrying the confidence the
 * normalizer has in the NEW value. Used both for catalog_feed_items.diff and
 * as evidence in the catalog_review agent_tasks payload.
 */
export function buildFieldDiff(
  existing: ExistingProductFields,
  normalized: NormalizedFields,
  fieldConfidence: Record<string, number>,
  category: string | null,
): Record<string, DiffEntry> {
  const out: Record<string, DiffEntry> = {};
  const consider = (
    field: string,
    oldVal: unknown,
    newVal: unknown,
    confidence: number,
  ) => {
    if (newVal == null && oldVal == null) return;
    if (differs(oldVal, newVal)) out[field] = { old: oldVal ?? null, new: newVal ?? null, confidence };
  };

  consider('name', existing.name, normalized.name, fieldConfidence.name ?? 1.0);
  consider('price_retail', existing.price_retail, normalized.price_retail_cents, fieldConfidence.price ?? 1.0);
  if (normalized.price_trade_cents != null) {
    consider('price_trade', existing.price_trade, normalized.price_trade_cents, fieldConfidence.price ?? 1.0);
  }
  if (normalized.dimensions != null) {
    consider('dimensions', existing.dimensions, normalized.dimensions, fieldConfidence.dimensions ?? 1.0);
  }
  if (normalized.vendor_sku != null) {
    consider('vendor_sku', existing.vendor_sku, normalized.vendor_sku, 1.0);
  }
  if (normalized.materials.length > 0) {
    consider('materials', existing.materials, normalized.materials, 1.0);
  }
  if (normalized.finishes.length > 0) {
    consider('finishes', existing.finishes, normalized.finishes, 1.0);
  }
  if (normalized.freight_class != null) {
    consider('freight_class', existing.freight_class, normalized.freight_class, 1.0);
  }
  if (normalized.lead_time_weeks != null) {
    consider('lead_time_weeks', existing.lead_time_weeks, normalized.lead_time_weeks, 1.0);
  }
  if (category != null) {
    consider('category', existing.category, category, fieldConfidence.category ?? 1.0);
  }

  return out;
}
