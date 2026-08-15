import {
  CatalogRequestError,
  CatalogSourceError,
  normalizeCatalogRows,
  parseCatalogIds,
  queryCatalogViaHyperdrive,
  queryCatalogViaLegacy,
} from '../src/catalog';
import type { DatabaseClientFactory } from '../src/database';
import type { EdgeApiEnv } from '../src/env';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Product ${id}`,
    brand: 'Patina',
    category: 'chair',
    price_retail: 1200,
    images: ['https://assets.example/product.jpg'],
    short_description: 'A product',
    patina_managed: true,
    status: 'published',
    layer: 'catalog',
    ...overrides,
  };
}

describe('catalog request contract', () => {
  it('deduplicates case-insensitively and sorts UUIDs', () => {
    const ids = parseCatalogIds(
      new URL(
        `https://api.example/v1/catalog/products?ids=${B},${A},${A.toUpperCase()}`,
      ),
    );
    expect(ids).toEqual([A, B]);
  });

  it.each([
    '',
    '?ids=',
    '?ids=not-a-uuid',
    `?ids=${A},`,
    `?ids=${A}%27%20OR%201%3D1--`,
  ])('rejects invalid or injection-shaped ids: %s', (query) => {
    expect(() =>
      parseCatalogIds(
        new URL(`https://api.example/v1/catalog/products${query}`),
      ),
    ).toThrow(CatalogRequestError);
  });

  it('rejects more than 50 unique ids', () => {
    const ids = Array.from(
      { length: 51 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    );
    expect(() =>
      parseCatalogIds(
        new URL(`https://api.example/v1/catalog/products?ids=${ids.join(',')}`),
      ),
    ).toThrow('1 to 50 unique UUIDs');
  });

  it('filters non-catalog and non-published legacy rows and sorts output', () => {
    const result = normalizeCatalogRows(
      [
        row(B),
        row(A, { layer: 'personal' }),
        row(A, { layer: 'studio' }),
        row(A, { status: 'draft' }),
        row(A),
      ],
      [A, B],
      true,
    );
    expect(result.map((product) => product.id)).toEqual([A, B]);
    expect(result.every((product) => product.status === 'published')).toBe(
      true,
    );
  });

  it('normalizes nullable image arrays and numeric Postgres cents', () => {
    expect(
      normalizeCatalogRows(
        [row(A, { images: null, price_retail: '1200' })],
        [A],
        true,
      ),
    ).toEqual([
      expect.objectContaining({ id: A, imageUrls: [], retailCents: 1200 }),
    ]);
  });

  it.each([
    {},
    [null],
    [row(A, { name: null })],
    [row(A, { images: ['ok', 42] })],
    [row(A, { price_retail: '12.50' })],
    [row('00000000-0000-4000-8000-000000000099')],
  ])('rejects malformed source results', (value) => {
    expect(() => normalizeCatalogRows(value, [A], true)).toThrow(
      CatalogSourceError,
    );
  });
});

describe('catalog sources', () => {
  it('uses only DB_PUBLIC_CACHE and a parameterized UUID array for the approved view', async () => {
    const query = vi.fn(async (_text: string, _values?: unknown[]) => ({
      rows: [row(A, { layer: undefined })],
      command: '',
      rowCount: 1,
      oid: 0,
      fields: [],
    }));
    const createClient = vi.fn(() => ({
      connect: vi.fn(async () => undefined),
      query,
      end: vi.fn(async () => undefined),
    })) as unknown as DatabaseClientFactory;
    const result = await queryCatalogViaHyperdrive(
      {
        DB_FRESH: { connectionString: 'postgres://fresh' } as Hyperdrive,
        DB_PUBLIC_CACHE: {
          connectionString: 'postgres://public-cache',
        } as Hyperdrive,
      } as EdgeApiEnv,
      [A],
      createClient,
    );
    expect(createClient).toHaveBeenCalledWith('postgres://public-cache');
    expect(query.mock.calls[0][0]).toContain(
      'FROM public.edge_catalog_products',
    );
    expect(query.mock.calls[0][0]).toContain('id = ANY($1::uuid[])');
    expect(query.mock.calls[0][0]).not.toContain(A);
    expect(query.mock.calls[0][1]).toEqual([[A]]);
    expect(result).toEqual([
      expect.objectContaining({ id: A, status: 'published' }),
    ]);
  });

  it('constrains the legacy source to catalog and published with the anon credential', async () => {
    let requestUrl: URL | undefined;
    let requestHeaders: Headers | undefined;
    const result = await queryCatalogViaLegacy(
      {
        SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
      } as EdgeApiEnv,
      [A],
      async (input, init) => {
        requestUrl = new URL(input.toString());
        requestHeaders = new Headers(init?.headers);
        return Response.json([row(A)]);
      },
    );
    expect(requestUrl?.pathname).toBe('/rest/v1/products');
    expect(requestUrl?.searchParams.get('id')).toBe(`in.(${A})`);
    expect(requestUrl?.searchParams.get('layer')).toBe('eq.catalog');
    expect(requestUrl?.searchParams.get('status')).toBe('eq.published');
    expect(requestHeaders?.get('apikey')).toBe('anon-key');
    expect(requestHeaders?.get('authorization')).toBe('Bearer anon-key');
    expect(result).toHaveLength(1);
  });
});
