import Papa from 'papaparse';

export const REQUIRED_COLUMNS = ['name', 'brand', 'price'] as const;
export const OPTIONAL_COLUMNS = [
  'category',
  'sku',
  'slug',
  'short_description',
  'description',
  'msrp',
  'price_trade',
  'tags',
  'materials',
  'style_tags',
  'status',
  'source_url',
] as const;

export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

export type CanonicalColumn = (typeof ALL_COLUMNS)[number];

const ALIASES: Record<CanonicalColumn, string[]> = {
  name: ['name', 'product_name', 'product name', 'product', 'title'],
  brand: ['brand', 'brand_name', 'brand name', 'manufacturer', 'maker'],
  price: ['price', 'price_retail', 'retail_price', 'msrp_price', 'cost', 'price (usd)'],
  category: ['category', 'cat', 'type'],
  sku: ['sku', 'product_code'],
  slug: ['slug', 'handle'],
  short_description: ['short_description', 'short description', 'tagline'],
  description: ['description', 'long_description', 'full_description'],
  msrp: ['msrp', 'list_price'],
  price_trade: ['price_trade', 'trade_price', 'wholesale'],
  tags: ['tags', 'keywords'],
  materials: ['materials', 'material'],
  style_tags: ['style_tags', 'style tags', 'styles'],
  status: ['status', 'state'],
  source_url: ['source_url', 'source', 'url'],
};

const STATUS_VALUES = new Set(['draft', 'in_review', 'published', 'deprecated']);

export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export interface HeaderMapping {
  [csvHeader: string]: CanonicalColumn | null;
}

export interface ValidationIssue {
  field: CanonicalColumn;
  message: string;
}

export interface ValidatedRow {
  index: number; // 1-based row number from the CSV (after header)
  raw: Record<string, string>;
  payload: Record<string, unknown>;
  issues: ValidationIssue[];
  valid: boolean;
}

export interface ImportRunResult {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ index: number; reason: string; payload: Record<string, unknown> }>;
}

// ────────────────────────────────────────────────────────────────────────────

export function parseCsv(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h: string) => h.trim(),
      complete: (results) => {
        const data = (results.data ?? []) as Record<string, string>[];
        const headers = (results.meta.fields ?? []).map((h) => h.trim());
        resolve({ headers, rows: data });
      },
      error: (err) => reject(err),
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────

export function autoMapHeaders(headers: string[]): HeaderMapping {
  const mapping: HeaderMapping = {};
  const used = new Set<CanonicalColumn>();
  for (const header of headers) {
    const norm = header.toLowerCase().trim();
    let match: CanonicalColumn | null = null;
    for (const canonical of ALL_COLUMNS) {
      if (used.has(canonical)) continue;
      const aliases = ALIASES[canonical];
      if (aliases.some((a) => a === norm)) {
        match = canonical;
        break;
      }
    }
    mapping[header] = match;
    if (match) used.add(match);
  }
  return mapping;
}

// ────────────────────────────────────────────────────────────────────────────

function parsePrice(value: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const cleaned = value.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseList(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateRows(
  parsed: ParsedCsv,
  mapping: HeaderMapping,
): ValidatedRow[] {
  const csvHeaderByCanonical = new Map<CanonicalColumn, string>();
  for (const [csvHeader, canonical] of Object.entries(mapping)) {
    if (canonical && !csvHeaderByCanonical.has(canonical)) {
      csvHeaderByCanonical.set(canonical, csvHeader);
    }
  }

  return parsed.rows.map((raw, idx) => {
    const issues: ValidationIssue[] = [];
    const payload: Record<string, unknown> = {};

    const get = (canonical: CanonicalColumn): string => {
      const csvHeader = csvHeaderByCanonical.get(canonical);
      if (!csvHeader) return '';
      return (raw[csvHeader] ?? '').trim();
    };

    // Required: name
    const name = get('name');
    if (!name) issues.push({ field: 'name', message: 'Required' });
    else if (name.length > 255) issues.push({ field: 'name', message: 'Max 255 chars' });
    else payload.name = name;

    // Required: brand
    const brand = get('brand');
    if (!brand) issues.push({ field: 'brand', message: 'Required' });
    else payload.brand = brand;

    // Required: price (positive number)
    const priceRaw = get('price');
    if (!priceRaw) {
      issues.push({ field: 'price', message: 'Required' });
    } else {
      const price = parsePrice(priceRaw);
      if (price === null || price <= 0) {
        issues.push({ field: 'price', message: 'Must be a positive number' });
      } else {
        payload.price = price;
      }
    }

    // Optional fields
    const category = get('category');
    if (category) payload.category = category;

    const sku = get('sku');
    if (sku) payload.sku = sku;

    const slug = get('slug');
    if (slug) payload.slug = slug;

    const shortDescription = get('short_description');
    if (shortDescription) payload.shortDescription = shortDescription;

    const description = get('description');
    if (description) payload.description = description;

    const msrp = get('msrp');
    if (msrp) {
      const v = parsePrice(msrp);
      if (v !== null) payload.msrp = v;
    }

    const priceTrade = get('price_trade');
    if (priceTrade) {
      const v = parsePrice(priceTrade);
      if (v !== null) payload.priceTrade = v;
    }

    const tags = get('tags');
    if (tags) payload.tags = parseList(tags);

    const materials = get('materials');
    if (materials) payload.materials = parseList(materials);

    const styleTags = get('style_tags');
    if (styleTags) payload.styleTags = parseList(styleTags);

    const status = get('status').toLowerCase();
    if (status) {
      if (!STATUS_VALUES.has(status)) {
        issues.push({
          field: 'status',
          message: `Must be one of ${[...STATUS_VALUES].join(', ')}`,
        });
      } else {
        payload.status = status;
      }
    }

    const sourceUrl = get('source_url');
    if (sourceUrl) payload.sourceUrl = sourceUrl;

    return {
      index: idx + 1,
      raw,
      payload,
      issues,
      valid: issues.length === 0,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────

export function buildErrorReportCsv(
  rows: ValidatedRow[],
  serverErrors: Array<{ index: number; reason: string }>,
): string {
  const errorByIndex = new Map(serverErrors.map((e) => [e.index, e.reason]));
  const failures = rows.filter(
    (r) => !r.valid || errorByIndex.has(r.index),
  );

  const out = failures.map((r) => ({
    row: r.index,
    name: r.payload.name ?? r.raw.name ?? '',
    brand: r.payload.brand ?? r.raw.brand ?? '',
    price: r.payload.price ?? r.raw.price ?? '',
    issue:
      errorByIndex.get(r.index) ??
      r.issues.map((i) => `${i.field}: ${i.message}`).join('; '),
  }));

  return Papa.unparse(out, { columns: ['row', 'name', 'brand', 'price', 'issue'] });
}
