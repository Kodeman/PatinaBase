import type { CatalogProductSummary } from '@patina/types';
import { createWorker, type WorkerDependencies } from '../src';
import {
  queryCatalogViaHyperdrive,
  queryCatalogViaLegacy,
} from '../src/catalog';
import { probeBinding } from '../src/database';
import type { EdgeApiEnv } from '../src/env';
import { ALERT_EVENTS, rolloutBucket } from '../src/security';

const ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';
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
    LEGACY_FETCH_TIMEOUT_MS: '100',
    COMPATIBILITY_FETCH_TIMEOUT_MS: '100',
    WEBSOCKET_HANDSHAKE_TIMEOUT_MS: '50',
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
    queryFresh: vi.fn(async () => [product]),
    queryLegacy: vi.fn(async () => [product]),
    probe: vi.fn(async () => true),
    authorizeHealth: vi.fn(async () => true),
    randomUUID: () => 'trace-0000000000000000000000001',
    cohortKey: () => 'trusted-cohort',
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
    expect(deps.queryLegacy).toHaveBeenCalledWith(
      expect.anything(),
      [ID],
      expect.any(AbortSignal),
    );
    expect(deps.queryHyperdrive).not.toHaveBeenCalled();
  });

  it('keeps validation errors private and rejects injection-shaped ids', async () => {
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

  it('falls back to legacy and emits the exact alert event on Hyperdrive failure', async () => {
    const deps = dependencies({
      queryHyperdrive: vi.fn(async () => Promise.reject(new Error('timeout'))),
    });
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '100' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([product]);
    expect(deps.log).toHaveBeenCalledWith({
      event: ALERT_EVENTS.catalogHyperdriveFailure,
      severity: 'error',
      traceId: 'trace-0000000000000000000000001',
      routeClass: 'catalog.products',
      fallback: 'legacy',
    });
  });

  it('falls back to legacy and logs a critical normalized mismatch', async () => {
    const deps = dependencies({
      queryHyperdrive: vi.fn(async () => [{ ...product, name: 'Different' }]),
    });
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '100' }),
    );
    expect(await response.json()).toEqual([product]);
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ALERT_EVENTS.catalogShadowMismatch,
        severity: 'critical',
        fallback: 'legacy',
      }),
    );
  });

  it('uses the validated shadow state to compare asynchronously', async () => {
    const deps = dependencies({
      queryHyperdrive: vi.fn(async () => [{ ...product, name: 'Different' }]),
    });
    const { response, waits } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'shadow' }),
    );
    expect(response.status).toBe(200);
    await Promise.all(waits);
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: ALERT_EVENTS.catalogShadowMismatch }),
    );
  });

  it('returns a generic no-store error when both canary sources fail', async () => {
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

  it('returns an uncacheable Hyperdrive result when the legacy body misses its deadline', async () => {
    const deps = dependencies({
      queryLegacy: (requestEnv, ids, signal) =>
        queryCatalogViaLegacy(
          requestEnv,
          ids,
          signal,
          async () =>
            new Response(new ReadableStream<Uint8Array>({ start() {} })),
        ),
    });
    const { response } = await request(
      createWorker(deps),
      env({
        CATALOG_SOURCE: 'hyperdrive',
        CATALOG_HYPERDRIVE_PERCENT: '100',
        LEGACY_FETCH_TIMEOUT_MS: '5',
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([product]);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ALERT_EVENTS.catalogUnverified,
        severity: 'critical',
        fallback: 'hyperdrive_public_view',
      }),
    );
  });

  it('derives canary selection from the trusted dependency and ignores caller headers', async () => {
    let selectedKey = '';
    let legacyKey = '';
    for (let index = 0; index < 1000 && (!selectedKey || !legacyKey); index += 1) {
      const key = `trusted-${index}`;
      if (rolloutBucket(key) < 1) selectedKey = key;
      else legacyKey = key;
    }
    const selectedDeps = dependencies({ cohortKey: () => selectedKey });
    await request(
      createWorker(selectedDeps),
      env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '1' }),
      undefined,
      { 'x-patina-rollout-key': legacyKey },
    );
    expect(selectedDeps.queryHyperdrive).toHaveBeenCalledTimes(1);

    const legacyDeps = dependencies({ cohortKey: () => legacyKey });
    await request(
      createWorker(legacyDeps),
      env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '1' }),
      undefined,
      { 'x-patina-rollout-key': selectedKey },
    );
    expect(legacyDeps.queryHyperdrive).not.toHaveBeenCalled();
  });

  it.each([
    { CATALOG_SOURCE: 'invalid', CATALOG_HYPERDRIVE_PERCENT: '0' },
    { CATALOG_SOURCE: 'legacy', CATALOG_HYPERDRIVE_PERCENT: '1' },
    { CATALOG_SOURCE: 'shadow', CATALOG_HYPERDRIVE_PERCENT: '1' },
    { CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '0' },
    { CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '101' },
  ])('fails closed on an invalid catalog state: %o', async (state) => {
    const deps = dependencies();
    const { response } = await request(createWorker(deps), env(state));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'service_unavailable' });
    expect(deps.queryLegacy).not.toHaveBeenCalled();
    expect(deps.queryHyperdrive).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ALERT_EVENTS.configurationInvalid,
        routeClass: 'catalog.products',
      }),
    );
  });

  it('fails closed before routing when a required environment value is missing', async () => {
    const deps = dependencies();
    const { response } = await request(
      createWorker(deps),
      env({ SUPABASE_JWKS_URL: '' }),
    );
    expect(response.status).toBe(503);
    expect(deps.queryLegacy).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: ALERT_EVENTS.configurationInvalid }),
    );
  });

  it.each([undefined, '', '   '])(
    'fails closed without logging a missing or blank publishable secret: %o',
    async (publishableKey) => {
      const deps = dependencies();
      const { response } = await request(
        createWorker(deps),
        env({ SUPABASE_ANON_KEY: publishableKey }),
      );
      expect(response.status).toBe(503);
      expect(deps.queryLegacy).not.toHaveBeenCalled();
      expect(deps.queryHyperdrive).not.toHaveBeenCalled();
      expect(deps.log).toHaveBeenCalledWith({
        event: ALERT_EVENTS.configurationInvalid,
        severity: 'critical',
        traceId: 'trace-0000000000000000000000001',
        routeClass: 'catalog.products',
        status: 503,
      });
      expect(JSON.stringify(vi.mocked(deps.log).mock.calls)).not.toContain(
        'SUPABASE_ANON_KEY',
      );
    },
  );
});

describe('promotion ladder binding gate', () => {
  it.each([
    { CATALOG_SOURCE: 'shadow', CATALOG_HYPERDRIVE_PERCENT: '0', DB_FRESH: undefined },
    {
      CATALOG_SOURCE: 'shadow',
      CATALOG_HYPERDRIVE_PERCENT: '0',
      DB_PUBLIC_CACHE: undefined,
    },
    {
      CATALOG_SOURCE: 'shadow',
      CATALOG_HYPERDRIVE_PERCENT: '0',
      DB_FRESH: undefined,
      DB_PUBLIC_CACHE: undefined,
    },
    {
      CATALOG_SOURCE: 'hyperdrive',
      CATALOG_HYPERDRIVE_PERCENT: '100',
      DB_PUBLIC_CACHE: undefined,
    },
    {
      CATALOG_SOURCE: 'hyperdrive',
      CATALOG_HYPERDRIVE_PERCENT: '5',
      DB_FRESH: undefined,
    },
    {
      CATALOG_SOURCE: 'hyperdrive',
      CATALOG_HYPERDRIVE_PERCENT: '100',
      DB_FRESH: undefined,
      DB_PUBLIC_CACHE: undefined,
    },
  ])(
    'refuses to boot a promoted catalog source without its Hyperdrive bindings: %o',
    async (state) => {
      const deps = dependencies();
      const { response } = await request(createWorker(deps), env(state));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'service_unavailable' });
      expect(deps.queryLegacy).not.toHaveBeenCalled();
      expect(deps.queryFresh).not.toHaveBeenCalled();
      expect(deps.queryHyperdrive).not.toHaveBeenCalled();
      expect(deps.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: ALERT_EVENTS.configurationInvalid,
          severity: 'critical',
          routeClass: 'catalog.products',
        }),
      );
    },
  );

  it('still serves rung one with no Hyperdrive bindings at all', async () => {
    const deps = dependencies();
    const { response } = await request(
      createWorker(deps),
      env({ DB_FRESH: undefined, DB_PUBLIC_CACHE: undefined }),
    );
    expect(response.status).toBe(200);
    expect(deps.queryLegacy).toHaveBeenCalledTimes(1);
  });
});

describe('shadow verification evidence', () => {
  it('compares legacy, fresh, and cached before ruling a shadow run clean', async () => {
    const deps = dependencies();
    const { response, waits } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'shadow' }),
    );
    expect(response.status).toBe(200);
    await Promise.all(waits);
    expect(deps.queryFresh).toHaveBeenCalledWith(expect.anything(), [ID]);
    expect(deps.queryHyperdrive).toHaveBeenCalledWith(expect.anything(), [ID]);
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ALERT_EVENTS.catalogShadowMatch,
        severity: 'info',
        traceId: 'trace-0000000000000000000000001',
        routeClass: 'catalog.products',
        comparison: 'legacy_vs_fresh_vs_cached',
        legacyCount: 1,
        freshCount: 1,
        hyperdriveCount: 1,
      }),
    );
  });

  it('alerts when only the fresh read disagrees with legacy and cached', async () => {
    const deps = dependencies({
      queryFresh: vi.fn(async () => [{ ...product, retailCents: 999 }]),
    });
    const { waits } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'shadow' }),
    );
    await Promise.all(waits);
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ALERT_EVENTS.catalogShadowMismatch,
        severity: 'critical',
        comparison: 'legacy_vs_fresh_vs_cached',
        freshCount: 1,
        mismatchedIdCount: 1,
      }),
    );
    expect(deps.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: ALERT_EVENTS.catalogShadowMatch }),
    );
  });

  it('names the failing binding when a shadow leg cannot be read', async () => {
    const deps = dependencies({
      queryFresh: vi.fn(async () => Promise.reject(new Error('pool exhausted'))),
    });
    const { waits } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'shadow' }),
    );
    await Promise.all(waits);
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ALERT_EVENTS.catalogHyperdriveFailure,
        binding: 'DB_FRESH',
        fallback: 'legacy',
      }),
    );
    expect(deps.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: ALERT_EVENTS.catalogShadowMatch }),
    );
  });

  it('records a positive verification when the canary comparison agrees', async () => {
    const deps = dependencies();
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '100' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=15',
    );
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ALERT_EVENTS.catalogShadowMatch,
        severity: 'info',
        comparison: 'legacy_vs_cached',
        legacyCount: 1,
        hyperdriveCount: 1,
      }),
    );
  });

  it('discriminates a stale value from an entirely different result set', async () => {
    async function mismatchEvent(rows: CatalogProductSummary[]) {
      const deps = dependencies({ queryHyperdrive: vi.fn(async () => rows) });
      await request(
        createWorker(deps),
        env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '100' }),
      );
      return vi
        .mocked(deps.log)
        .mock.calls.map(([event]) => event)
        .find((event) => event.event === ALERT_EVENTS.catalogShadowMismatch);
    }

    const staleValue = await mismatchEvent([{ ...product, retailCents: 999 }]);
    const differentSet = await mismatchEvent([
      { ...product, id: OTHER_ID, name: 'Other Chair' },
    ]);

    expect(staleValue).toEqual(
      expect.objectContaining({
        legacyCount: 1,
        hyperdriveCount: 1,
        mismatchedIdCount: 1,
        legacyDigest: expect.stringMatching(/^[0-9a-f]{8}$/),
        hyperdriveDigest: expect.stringMatching(/^[0-9a-f]{8}$/),
      }),
    );
    expect(differentSet).toEqual(
      expect.objectContaining({ mismatchedIdCount: 2 }),
    );
    expect(staleValue).not.toEqual(differentSet);
  });
});

describe('unverified degradation policy', () => {
  it('never publicly caches a Hyperdrive body whose comparison did not run', async () => {
    const deps = dependencies({
      queryLegacy: vi.fn(async () => Promise.reject(new Error('upstream 401'))),
    });
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '100' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([product]);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(deps.log).toHaveBeenCalledWith({
      event: ALERT_EVENTS.catalogUnverified,
      severity: 'critical',
      traceId: 'trace-0000000000000000000000001',
      routeClass: 'catalog.products',
      fallback: 'hyperdrive_public_view',
    });
  });
});

describe('health, proxy deadline, and default response policy', () => {
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
    expect(JSON.stringify(body)).not.toMatch(/postgres|version|schema|credential/i);
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

  it('returns an alertable 504 for a never-settling compatibility fetch', async () => {
    const deps = dependencies({
      fetcher: () => new Promise<Response>(() => undefined),
    });
    const { response } = await request(
      createWorker(deps),
      env({ COMPATIBILITY_FETCH_TIMEOUT_MS: '5' }),
      'https://api.patina.cloud/rest/v1/products',
    );
    expect(response.status).toBe(504);
    expect(deps.log).toHaveBeenCalledWith({
      event: ALERT_EVENTS.compatibilityTimeout,
      severity: 'error',
      traceId: 'trace-0000000000000000000000001',
      routeClass: 'compat.rest',
      status: 504,
    });
  });

  it('uses only a server-generated trace id', async () => {
    const { response } = await request(
      createWorker(dependencies()),
      env(),
      'https://api.patina.cloud/not-found/private-name',
      { 'x-patina-trace-id': 'caller-controlled-trace' },
    );
    expect(response.headers.get('x-patina-trace-id')).toBe(
      'trace-0000000000000000000000001',
    );
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
