import {
  CATALOG_SELECT_SQL,
  CatalogRequestError,
  CatalogSourceError,
  LEGACY_CATALOG_MAX_BYTES,
  normalizeCatalogRows,
  parseCatalogIds,
  queryCatalogViaHyperdrive,
  queryCatalogViaLegacy,
} from '../src/catalog';
import loginContract from './fixtures/edge-catalog-login-contract.json';
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

  it('trims comma-separated ids before validation and deduplication', () => {
    expect(
      parseCatalogIds(
        new URL(
          `https://api.example/v1/catalog/products?ids=${encodeURIComponent(` ${B} , ${A} `)}`,
        ),
      ),
    ).toEqual([A, B]);
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
          connectionString: 'postgres://edge_catalog_login@public-cache',
        } as Hyperdrive,
      } as EdgeApiEnv,
      [A],
      createClient,
    );
    expect(createClient).toHaveBeenCalledWith(
      'postgres://edge_catalog_login@public-cache',
    );
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

  it('matches the inherited edge_catalog_reader login contract without role changes', () => {
    expect(loginContract).toEqual({
      loginRole: 'edge_catalog_login',
      inheritedRoles: ['edge_catalog_reader'],
      allowedRelations: ['public.edge_catalog_products'],
      forbiddenRelations: ['public.products'],
      queryRoleChanges: false,
    });
    expect(CATALOG_SELECT_SQL).toContain('FROM public.edge_catalog_products');
    expect(CATALOG_SELECT_SQL).not.toMatch(/public\.products|set\s+(local\s+)?role/i);
    expect(CATALOG_SELECT_SQL).toContain('ANY($1::uuid[])');
  });

  it('constrains the legacy source to catalog and published with the anon credential', async () => {
    let requestUrl: URL | undefined;
    let requestHeaders: Headers | undefined;
    const result = await queryCatalogViaLegacy(
      {
        SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        LEGACY_FETCH_TIMEOUT_MS: '1000',
      } as EdgeApiEnv,
      [A],
      undefined,
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

  it('times out a legacy fetch that never settles even when it ignores abort', async () => {
    await expect(
      queryCatalogViaLegacy(
        {
          SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
          SUPABASE_ANON_KEY: 'anon-key',
          LEGACY_FETCH_TIMEOUT_MS: '5',
        } as EdgeApiEnv,
        [A],
        undefined,
        () => new Promise<Response>(() => undefined),
      ),
    ).rejects.toThrow(CatalogSourceError);
  });

  it('keeps the deadline active after headers while the response body never closes', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('['));
      },
    });
    await expect(
      queryCatalogViaLegacy(
        {
          SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
          SUPABASE_ANON_KEY: 'anon-key',
          LEGACY_FETCH_TIMEOUT_MS: '5',
        } as EdgeApiEnv,
        [A],
        undefined,
        async () => new Response(body),
      ),
    ).rejects.toThrow(CatalogSourceError);
  });

  it('rejects a streaming body as soon as it exceeds the bounded maximum', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(LEGACY_CATALOG_MAX_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    await expect(
      queryCatalogViaLegacy(
        {
          SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
          SUPABASE_ANON_KEY: 'anon-key',
          LEGACY_FETCH_TIMEOUT_MS: '1000',
        } as EdgeApiEnv,
        [A],
        undefined,
        async () => new Response(body),
      ),
    ).rejects.toThrow(CatalogSourceError);
  });

  it('cancels a pending body read when the caller aborts after headers', async () => {
    const controller = new AbortController();
    let bodyReadStarted: (() => void) | undefined;
    const readingBody = new Promise<void>((resolve) => {
      bodyReadStarted = resolve;
    });
    const pending = queryCatalogViaLegacy(
      {
        SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        LEGACY_FETCH_TIMEOUT_MS: '1000',
      } as EdgeApiEnv,
      [A],
      controller.signal,
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull() {
              bodyReadStarted?.();
              return new Promise<void>(() => undefined);
            },
          }),
        ),
    );
    await readingBody;
    controller.abort();
    await expect(pending).rejects.toThrow(CatalogSourceError);
  });
});
