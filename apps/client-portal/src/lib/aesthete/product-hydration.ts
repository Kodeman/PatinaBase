import type { CatalogProductSummary } from '@patina/types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function configuredEdgeApiUrl(supabaseUrl: string): string {
  return process.env.NEXT_PUBLIC_EDGE_API_URL ?? supabaseUrl;
}

function isCatalogProductSummary(
  value: unknown,
): value is CatalogProductSummary {
  if (!value || typeof value !== 'object') return false;
  const product = value as Partial<CatalogProductSummary>;
  return (
    typeof product.id === 'string' &&
    UUID_PATTERN.test(product.id) &&
    typeof product.name === 'string' &&
    (product.brand === null || typeof product.brand === 'string') &&
    (product.category === null || typeof product.category === 'string') &&
    (product.retailCents === null ||
      (typeof product.retailCents === 'number' &&
        Number.isSafeInteger(product.retailCents) &&
        product.retailCents >= 0)) &&
    Array.isArray(product.imageUrls) &&
    product.imageUrls.every((image) => typeof image === 'string') &&
    (product.shortDescription === null ||
      typeof product.shortDescription === 'string') &&
    typeof product.patinaManaged === 'boolean' &&
    product.status === 'published'
  );
}

export function normalizedCatalogIds(productIds: string[]): string[] {
  return [
    ...new Set(
      productIds
        .map((id) => id.toLowerCase())
        .filter((id) => UUID_PATTERN.test(id)),
    ),
  ]
    .sort()
    .slice(0, 50);
}

export async function hydrateCatalogProducts<T>(
  edgeApiUrl: string,
  productIds: string[],
  mapProduct: (product: CatalogProductSummary) => T,
  legacyFallback: (safeIds: string[]) => Promise<Map<string, T>>,
  signal?: AbortSignal,
): Promise<Map<string, T>> {
  const ids = normalizedCatalogIds(productIds);
  if (ids.length === 0) return new Map();

  const url = new URL(`${edgeApiUrl.replace(/\/+$/, '')}/v1/catalog/products`);
  url.searchParams.set('ids', ids.join(','));
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal,
    });
    if (response.ok) {
      const products = (await response.json()) as unknown;
      if (Array.isArray(products) && products.every(isCatalogProductSummary)) {
        return new Map(
          products.map((product) => [product.id, mapProduct(product)]),
        );
      }
    }
  } catch {
    // The constrained legacy read is the canary rollback contract.
  }
  return legacyFallback(ids);
}
