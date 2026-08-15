import type { CatalogProductSummary } from '@patina/types';
import { createWorker, type WorkerDependencies } from '../src';
import { queryCatalogViaHyperdrive } from '../src/catalog';
import { probeBinding } from '../src/database';
import type { EdgeApiEnv } from '../src/env';

const ID = '00000000-0000-4000-8000-000000000001';
const product: CatalogProductSummary = {
  id: ID,
  name: 'Catalog Chair',
  brand: 'Patina',
  category: 'chair',
  retailCents: 1200,
  imageUrls: ['https://assets.example/chair.jpg'],
  shortDescription: 'A chair',
  patinaManaged: true,
  status: 'published',
};

function env(overrides: Partial<EdgeApiEnv> = {}): EdgeApiEnv {
  return {
    DB_FRESH: { connectionString: 'postgres://fresh' } as Hyperdrive,
    DB_PUBLIC_CACHE: {
      connectionString: 'postgres://public-cache',
    } as Hyperdrive,
    SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_JWT_ISSUER: 'https://project.supabase.co/auth/v1',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    SUPABASE_JWKS_URL:
      'https://project.supabase.co/auth/v1/.well-known/jwks.json',
    CATALOG_SOURCE: 'legacy',
    CATALOG_HYPERDRIVE_PERCENT: '0',
    CATALOG_SHADOW_ENABLED: 'false',
    ...overrides,
  };
}

function context() {
  const waits: Promise<unknown>[] = [];
  return {
    waits,
    ctx: {
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
      passThroughOnException() {},
      props: {},
    } as ExecutionContext,
  };
}

function dependencies(
  overrides: Partial<WorkerDependencies> = {},
): WorkerDependencies {
  return {
    fetcher: vi.fn(async () => new Response('upstream')),
    queryHyperdrive: vi.fn(async () => [product]),
    queryLegacy: vi.fn(async () => [product]),
    probe: vi.fn(async () => true),
    authorizeHealth: vi.fn(async () => true),
    randomUUID: () => 'trace-0000000000000000000000001',
    log: vi.fn(),
    ...overrides,
  };
}

async function request(
  worker: ReturnType<typeof createWorker>,
  requestEnv: EdgeApiEnv,
  url = `https://api.patina.cloud/v1/catalog/products?ids=${ID}`,
  headers?: HeadersInit,
) {
  const { ctx, waits } = context();
  const response = await worker.fetch!(
    new Request(url, { headers }) as Request<
      unknown,
      IncomingRequestCfProperties
    >,
    requestEnv,
    ctx,
  );
  return { response, waits };
}

describe('catalog route', () => {
  it('returns deterministic public output with ETag and explicit cache policy', async () => {
    const deps = dependencies();
    const { response } = await request(createWorker(deps), env());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([product]);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=15',
    );
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(deps.queryLegacy).toHaveBeenCalledWith(expect.anything(), [ID]);
    expect(deps.queryHyperdrive).not.toHaveBeenCalled();
  });

  it('keeps validation errors private and does not query either source', async () => {
    const deps = dependencies();
    const { response } = await request(
      createWorker(deps),
      env(),
      'https://api.patina.cloud/v1/catalog/products?ids=bad%27%20OR%201%3D1--',
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(deps.queryLegacy).not.toHaveBeenCalled();
    expect(deps.queryHyperdrive).not.toHaveBeenCalled();
  });

  it('falls back to legacy and logs an alertable event on Hyperdrive failure', async () => {
    const deps = dependencies({
      queryHyperdrive: vi.fn(async () => Promise.reject(new Error('timeout'))),
    });
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '100' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([product]);
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'catalog_hyperdrive_failure',
        fallback: 'legacy',
      }),
    );
  });

  it('falls back to legacy and logs on a normalized shadow mismatch', async () => {
    const changed = { ...product, name: 'Different' };
    const deps = dependencies({
      queryHyperdrive: vi.fn(async () => [changed]),
    });
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '100' }),
    );
    expect(await response.json()).toEqual([product]);
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'catalog_shadow_mismatch',
        fallback: 'legacy',
      }),
    );
  });

  it('runs non-canary Hyperdrive comparison in waitUntil', async () => {
    const deps = dependencies({
      queryHyperdrive: vi.fn(async () => [{ ...product, name: 'Different' }]),
    });
    const { response, waits } = await request(
      createWorker(deps),
      env({ CATALOG_SHADOW_ENABLED: 'true' }),
    );
    expect(response.status).toBe(200);
    await Promise.all(waits);
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'catalog_shadow_mismatch' }),
    );
  });

  it('returns a generic no-store error when both sources fail', async () => {
    const deps = dependencies({
      queryLegacy: vi.fn(async () =>
        Promise.reject(new Error('malformed response with content')),
      ),
      queryHyperdrive: vi.fn(async () =>
        Promise.reject(new Error('pool exhausted')),
      ),
    });
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '100' }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'catalog_unavailable' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(JSON.stringify(vi.mocked(deps.log).mock.calls)).not.toContain(
      'malformed response with content',
    );
  });

  it('fails a missing public-cache binding closed to the legacy catalog', async () => {
    const deps = dependencies({ queryHyperdrive: queryCatalogViaHyperdrive });
    const requestEnv = env({
      DB_PUBLIC_CACHE: undefined,
      CATALOG_SOURCE: 'hyperdrive',
      CATALOG_HYPERDRIVE_PERCENT: '100',
    });
    const { response } = await request(createWorker(deps), requestEnv);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([product]);
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'catalog_hyperdrive_failure',
        fallback: 'legacy',
      }),
    );
  });

  it('uses stable request bucketing to select only configured canary keys', async () => {
    const deps = dependencies();
    const worker = createWorker(deps);
    const requestEnv = env({
      CATALOG_SOURCE: 'hyperdrive',
      CATALOG_HYPERDRIVE_PERCENT: '1',
    });
    let selectedKey: string | undefined;
    let legacyKey: string | undefined;
    const { rolloutBucket } = await import('../src/security');
    for (
      let index = 0;
      index < 1000 && (!selectedKey || !legacyKey);
      index += 1
    ) {
      const key = `client-${index}`;
      if (rolloutBucket(key) < 1) selectedKey = key;
      else legacyKey = key;
    }
    await request(worker, requestEnv, undefined, {
      'x-patina-rollout-key': selectedKey!,
    });
    expect(deps.queryHyperdrive).toHaveBeenCalledTimes(1);
    vi.mocked(deps.queryHyperdrive).mockClear();
    await request(worker, requestEnv, undefined, {
      'x-patina-rollout-key': legacyKey!,
    });
    expect(deps.queryHyperdrive).not.toHaveBeenCalled();
  });
});

describe('health and default response policy', () => {
  it('hides health existence unless Access or the service token authorizes it', async () => {
    const deps = dependencies({ authorizeHealth: vi.fn(async () => false) });
    const { response } = await request(
      createWorker(deps),
      env(),
      'https://api.patina.cloud/_internal/health',
    );
    expect(response.status).toBe(404);
    expect(deps.probe).not.toHaveBeenCalled();
  });

  it('probes both bindings without returning database details', async () => {
    const deps = dependencies({
      probe: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    });
    const { response } = await request(
      createWorker(deps),
      env(),
      'https://api.patina.cloud/_internal/health',
    );
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: 'degraded',
      checks: { fresh: 'ok', publicCache: 'unavailable' },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /postgres|version|schema|credential/i,
    );
    expect(deps.probe).toHaveBeenCalledTimes(2);
  });

  it('reports missing bindings as unavailable without probing a database', async () => {
    const deps = dependencies({ probe: probeBinding });
    const { response } = await request(
      createWorker(deps),
      env({ DB_FRESH: undefined, DB_PUBLIC_CACHE: undefined }),
      'https://api.patina.cloud/_internal/health',
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'degraded',
      checks: { fresh: 'unavailable', publicCache: 'unavailable' },
    });
  });

  it('makes unknown and authenticated-ready responses private by default', async () => {
    const { response } = await request(
      createWorker(dependencies()),
      env(),
      'https://api.patina.cloud/v1/not-yet-implemented',
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
