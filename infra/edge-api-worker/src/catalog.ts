import type { CatalogProductSummary } from '@patina/types';
import type { EdgeApiEnv } from './env';
import { withClient, type DatabaseClientFactory } from './database';
import { fetchWithDeadline } from './deadline';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CatalogRequestError extends Error {}
export class CatalogSourceError extends Error {}

export const CATALOG_SELECT_SQL = `SELECT id::text, name, brand, category, price_retail, images,
                short_description, patina_managed, status
           FROM public.edge_catalog_products
          WHERE id = ANY($1::uuid[])
          ORDER BY id`;

interface CatalogRow {
  id?: unknown;
  name?: unknown;
  brand?: unknown;
  category?: unknown;
  price_retail?: unknown;
  images?: unknown;
  short_description?: unknown;
  patina_managed?: unknown;
  status?: unknown;
  layer?: unknown;
}

export function parseCatalogIds(url: URL): string[] {
  const raw = url.searchParams.get('ids');
  if (!raw) throw new CatalogRequestError('ids must contain 1 to 50 UUIDs');

  const pieces = raw.split(',');
  if (pieces.some((piece) => piece.length === 0)) {
    throw new CatalogRequestError('ids must contain 1 to 50 UUIDs');
  }

  const unique = new Set<string>();
  for (const piece of pieces) {
    const id = piece.trim().toLowerCase();
    if (!UUID_PATTERN.test(id))
      throw new CatalogRequestError('ids must be UUIDs');
    unique.add(id);
  }
  if (unique.size === 0 || unique.size > 50) {
    throw new CatalogRequestError('ids must contain 1 to 50 unique UUIDs');
  }
  return [...unique].sort();
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function normalizedRetailCents(value: unknown): number | null {
  if (value === null) return null;
  const number =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (
    typeof number !== 'number' ||
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw new CatalogSourceError('malformed catalog result');
  }
  return number;
}

export function normalizeCatalogRows(
  input: unknown,
  requestedIds: readonly string[],
  requireCatalogLayer: boolean,
): CatalogProductSummary[] {
  if (!Array.isArray(input))
    throw new CatalogSourceError('malformed catalog result');
  const requested = new Set(requestedIds);
  const normalized: CatalogProductSummary[] = [];

  for (const candidate of input) {
    if (!candidate || typeof candidate !== 'object') {
      throw new CatalogSourceError('malformed catalog result');
    }
    const row = candidate as CatalogRow;
    if (row.status !== 'published') continue;
    if (requireCatalogLayer && row.layer !== 'catalog') continue;
    if (row.layer !== undefined && row.layer !== 'catalog') continue;
    if (
      typeof row.id !== 'string' ||
      !UUID_PATTERN.test(row.id) ||
      !requested.has(row.id)
    ) {
      throw new CatalogSourceError('malformed catalog result');
    }
    if (
      typeof row.name !== 'string' ||
      !nullableString(row.brand) ||
      !nullableString(row.category) ||
      !nullableString(row.short_description) ||
      typeof row.patina_managed !== 'boolean' ||
      (row.images !== null && !Array.isArray(row.images)) ||
      (Array.isArray(row.images) &&
        !row.images.every((image) => typeof image === 'string'))
    ) {
      throw new CatalogSourceError('malformed catalog result');
    }
    normalized.push({
      id: row.id,
      name: row.name,
      brand: row.brand,
      category: row.category,
      retailCents: normalizedRetailCents(row.price_retail),
      imageUrls: row.images ?? [],
      shortDescription: row.short_description,
      patinaManaged: row.patina_managed,
      status: 'published',
    });
  }

  return normalized.sort((left, right) => left.id.localeCompare(right.id));
}

export async function queryCatalogViaHyperdrive(
  env: EdgeApiEnv,
  ids: string[],
  createClient?: DatabaseClientFactory,
): Promise<CatalogProductSummary[]> {
  if (!env.DB_PUBLIC_CACHE)
    throw new CatalogSourceError('catalog database unavailable');
  const rows = await withClient(
    env.DB_PUBLIC_CACHE,
    async (client) => {
      const result = await client.query<CatalogRow & Record<string, unknown>>(
        CATALOG_SELECT_SQL,
        [ids],
      );
      return result.rows;
    },
    createClient,
  );
  return normalizeCatalogRows(rows, ids, false);
}

export async function queryCatalogViaLegacy(
  env: EdgeApiEnv,
  ids: string[],
  callerSignal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<CatalogProductSummary[]> {
  if (!env.SUPABASE_ANON_KEY) {
    throw new CatalogSourceError('legacy catalog unavailable');
  }
  const base = env.SUPABASE_UPSTREAM_URL.replace(/\/+$/, '');
  const url = new URL(`${base}/rest/v1/products`);
  url.searchParams.set('id', `in.(${ids.join(',')})`);
  url.searchParams.set(
    'select',
    'id,name,brand,category,price_retail,images,short_description,patina_managed,status,layer',
  );
  url.searchParams.set('layer', 'eq.catalog');
  url.searchParams.set('status', 'eq.published');
  url.searchParams.set('order', 'id.asc');

  let response: Response;
  try {
    response = await fetchWithDeadline(
      fetcher,
      url,
      {
        headers: {
          accept: 'application/json',
          apikey: env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
      },
      callerSignal,
      Number(env.LEGACY_FETCH_TIMEOUT_MS),
    );
  } catch {
    throw new CatalogSourceError('legacy catalog unavailable');
  }
  if (!response.ok) throw new CatalogSourceError('legacy catalog unavailable');

  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    throw new CatalogSourceError('malformed catalog result');
  }
  return normalizeCatalogRows(rows, ids, true);
}

export function catalogResultsMatch(
  left: readonly CatalogProductSummary[],
  right: readonly CatalogProductSummary[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
