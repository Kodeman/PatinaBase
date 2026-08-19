import type { CatalogProductSummary } from '@patina/types';
import { generateKeyPair, SignJWT } from 'jose';
import { createWorker, type WorkerDependencies } from '../src';
import { withVerifiedSupabaseTransaction } from '../src/auth';
import {
  queryCatalogViaHyperdrive,
  queryCatalogViaLegacy,
} from '../src/catalog';
import {
  probeBinding,
  type DatabaseClient,
  type DatabaseClientFactory,
} from '../src/database';
import type { EdgeApiEnv } from '../src/env';
import { ALERT_EVENTS, rolloutBucket, structuredLog } from '../src/security';

const ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';
const SECRET_SENTINEL = 'sb_publishable_do-not-log-4c1f9ae2';
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
    DB_FRESH: { connectionString: 'postgres://rls-login' } as Hyperdrive,
    DB_CATALOG_FRESH: {
      connectionString: 'postgres://catalog-fresh',
    } as Hyperdrive,
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
    SCAN_ROUTES: 'off',
    SCAN_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    SCAN_R2_BUCKET: 'patina-staging-media-artifacts-us',
    MEDIA_UPLOADS: 'off',
    SCAN_R2_ORIGINALS_BUCKET: 'patina-staging-media-originals-us',
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
    verifyAuthenticated: vi.fn(async () => {
      throw new Error('unauthorized');
    }),
    resolveScanArtifacts: vi.fn(async () => []),
    authorizeUpload: vi.fn(async () => {}),
    createUploadIntent: vi.fn(async () => {
      throw new Error('media uploads are off in this fixture');
    }),
    resolveUploadForConfirm: vi.fn(async () => {
      throw new Error('media uploads are off in this fixture');
    }),
    confirmUpload: vi.fn(async () => {
      throw new Error('media uploads are off in this fixture');
    }),
    randomUUID: () => 'trace-0000000000000000000000001',
    cohortKey: () => 'trusted-cohort',
    now: () => new Date('2026-08-18T12:00:00.000Z'),
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
    },
  );

  it('never serializes the publishable secret when the upstream echoes it back', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const deps = dependencies({
      log: structuredLog,
      queryLegacy: (requestEnv, ids, signal) =>
        queryCatalogViaLegacy(requestEnv, ids, signal, async (_input, init) =>
          Response.json(
            {
              message: `Invalid API key: ${new Headers(init?.headers).get('apikey')}`,
            },
            { status: 401 },
          ),
        ),
    });
    const { response } = await request(
      createWorker(deps),
      env({ SUPABASE_ANON_KEY: SECRET_SENTINEL }),
    );
    const logged = consoleSpy.mock.calls.map(([line]) => String(line)).join('\n');
    consoleSpy.mockRestore();

    expect(response.status).toBe(503);
    // Guard against a vacuous assertion: prove the logging path actually ran.
    expect(logged).toContain(ALERT_EVENTS.catalogLegacyFailure);
    expect(logged).not.toContain(SECRET_SENTINEL);
  });

  it('never serializes the publishable secret when a compatibility upstream throws it', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const deps = dependencies({
      log: structuredLog,
      fetcher: () => {
        throw new Error(`connect ECONNREFUSED apikey=${SECRET_SENTINEL}`);
      },
    });
    const { response } = await request(
      createWorker(deps),
      env({ SUPABASE_ANON_KEY: SECRET_SENTINEL }),
      'https://api.patina.cloud/rest/v1/products',
    );
    const logged = consoleSpy.mock.calls.map(([line]) => String(line)).join('\n');
    consoleSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(logged).toContain(ALERT_EVENTS.requestFailure);
    expect(logged).not.toContain(SECRET_SENTINEL);
  });
});

describe('promotion ladder binding gate', () => {
  it.each([
    { CATALOG_SOURCE: 'shadow', CATALOG_HYPERDRIVE_PERCENT: '0', DB_FRESH: undefined },
    {
      CATALOG_SOURCE: 'shadow',
      CATALOG_HYPERDRIVE_PERCENT: '0',
      DB_CATALOG_FRESH: undefined,
    },
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
      env({ DB_FRESH: undefined, DB_CATALOG_FRESH: undefined, DB_PUBLIC_CACHE: undefined }),
    );
    expect(response.status).toBe(200);
    expect(deps.queryLegacy).toHaveBeenCalledTimes(1);
  });

  it('serves rung three without DB_CATALOG_FRESH — the fresh leg is unused there', async () => {
    const deps = dependencies();
    const { response } = await request(
      createWorker(deps),
      env({
        CATALOG_SOURCE: 'hyperdrive',
        CATALOG_HYPERDRIVE_PERCENT: '100',
        DB_CATALOG_FRESH: undefined,
      }),
    );
    expect(response.status).toBe(200);
    expect(deps.queryHyperdrive).toHaveBeenCalledTimes(1);
    expect(deps.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: ALERT_EVENTS.configurationInvalid }),
    );
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
        binding: 'DB_CATALOG_FRESH',
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
      checks: { fresh: 'ok', publicCache: 'unavailable', catalogFresh: 'not_applicable' },
    });
    expect(JSON.stringify(body)).not.toMatch(/postgres|version|schema|credential/i);
    expect(deps.probe).toHaveBeenCalledTimes(2);
  });

  it('reports an unprovisioned rung one as healthy and not applicable', async () => {
    const deps = dependencies({ probe: probeBinding });
    const { response } = await request(
      createWorker(deps),
      env({ DB_FRESH: undefined, DB_PUBLIC_CACHE: undefined }),
      'https://api.patina.cloud/_internal/health',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      checks: {
        fresh: 'not_applicable',
        publicCache: 'not_applicable',
        catalogFresh: 'not_applicable',
      },
    });
  });

  it('does not open a database connection for a rung one with no bindings', async () => {
    const deps = dependencies();
    const { response } = await request(
      createWorker(deps),
      env({ DB_FRESH: undefined, DB_PUBLIC_CACHE: undefined }),
      'https://api.patina.cloud/_internal/health',
    );
    expect(response.status).toBe(200);
    expect(deps.probe).not.toHaveBeenCalled();
  });

  it('still fails a promoted rung whose provisioned probe does not answer', async () => {
    const deps = dependencies({
      probe: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    });
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'shadow' }),
      'https://api.patina.cloud/_internal/health',
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'degraded',
      checks: { fresh: 'ok', publicCache: 'unavailable', catalogFresh: 'ok' },
    });
    expect(deps.probe).toHaveBeenCalledTimes(3);
  });

  it('degrades shadow mode when only the DB_CATALOG_FRESH fresh leg cannot answer', async () => {
    const deps = dependencies({
      probe: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
    });
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'shadow' }),
      'https://api.patina.cloud/_internal/health',
    );
    // Before health probed DB_CATALOG_FRESH this returned 200 ok while every
    // shadow comparison ran one-legged; now the fresh leg gates the rung.
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'degraded',
      checks: { fresh: 'ok', publicCache: 'ok', catalogFresh: 'unavailable' },
    });
    expect(deps.probe).toHaveBeenCalledTimes(3);
  });

  it('reports a healthy shadow rung with all three legs answering', async () => {
    const deps = dependencies({ probe: vi.fn(async () => true) });
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'shadow' }),
      'https://api.patina.cloud/_internal/health',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      checks: { fresh: 'ok', publicCache: 'ok', catalogFresh: 'ok' },
    });
    expect(deps.probe).toHaveBeenCalledTimes(3);
  });

  it('never probes DB_CATALOG_FRESH outside shadow mode even when it is bound', async () => {
    const deps = dependencies({ probe: vi.fn(async () => true) });
    const { response } = await request(
      createWorker(deps),
      env({ CATALOG_SOURCE: 'hyperdrive', CATALOG_HYPERDRIVE_PERCENT: '100' }),
      'https://api.patina.cloud/_internal/health',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      checks: { fresh: 'ok', publicCache: 'ok', catalogFresh: 'not_applicable' },
    });
    // DB_CATALOG_FRESH is bound in env() but the fresh leg is unused at rung
    // three, so only DB_FRESH and DB_PUBLIC_CACHE are probed.
    expect(deps.probe).toHaveBeenCalledTimes(2);
  });

  it('fails a rung one whose declared binding does not answer', async () => {
    const deps = dependencies({ probe: vi.fn(async () => false) });
    const { response } = await request(
      createWorker(deps),
      env(),
      'https://api.patina.cloud/_internal/health',
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'degraded',
      checks: {
        fresh: 'unavailable',
        publicCache: 'unavailable',
        catalogFresh: 'not_applicable',
      },
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

interface RecordedClient extends DatabaseClient {
  commands: Array<{ text: string; values?: unknown[] }>;
  ended: boolean;
}

function recordingFactory(clients: RecordedClient[]): DatabaseClientFactory {
  return () => {
    const client: RecordedClient = {
      commands: [],
      ended: false,
      async connect() {},
      async query(text, values) {
        this.commands.push({ text, values });
        return { rows: [], command: '', rowCount: 0, oid: 0, fields: [] };
      },
      async end() {
        this.ended = true;
      },
    };
    clients.push(client);
    return client;
  };
}

const AUTH_ISSUER = 'https://project.supabase.co/auth/v1';
const AUTH_AUDIENCE = 'authenticated';

async function authToken(
  privateKey: CryptoKey,
  overrides: {
    issuer?: string;
    audience?: string;
    expiration?: number;
    role?: string;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: overrides.role ?? 'authenticated' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('00000000-0000-4000-8000-000000000009')
    .setIssuer(overrides.issuer ?? AUTH_ISSUER)
    .setAudience(overrides.audience ?? AUTH_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(overrides.expiration ?? now + 60)
    .sign(privateKey);
}

function authRequest(
  worker: ReturnType<typeof createWorker>,
  requestEnv: EdgeApiEnv,
  headers?: HeadersInit,
) {
  return request(
    worker,
    requestEnv,
    'https://api.patina.cloud/v1/_authcheck',
    headers,
  );
}

describe('authenticated probe route', () => {
  it('runs the verified JWT through SET ROLE authenticated + set_config and returns only {ok:true}', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const clients: RecordedClient[] = [];
    const createClient = recordingFactory(clients);
    const deps = dependencies({
      verifyAuthenticated: (req, requestEnv, work) =>
        withVerifiedSupabaseTransaction(req, requestEnv, work, {
          key: publicKey,
          createClient,
        }),
    });
    const { response } = await authRequest(createWorker(deps), env(), {
      authorization: `Bearer ${await authToken(privateKey)}`,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('cache-control')).toBe('private, no-store');

    expect(clients).toHaveLength(1);
    const commands = clients[0].commands.map((command) => command.text);
    expect(commands[0]).toBe('BEGIN');
    expect(commands[1]).toBe('SET LOCAL ROLE authenticated');
    expect(commands[2]).toBe(
      "SELECT set_config('request.jwt.claims', $1, true)",
    );
    // The probe's own data-free statement — no application table is read.
    expect(commands).toContain(
      "SELECT current_user, current_setting('request.jwt.claims', true)",
    );
    expect(commands.at(-1)).toBe('COMMIT');
    expect(clients[0].ended).toBe(true);

    // The set_config value carries the verified claims; they are never returned
    // to the client (the body is exactly {ok:true}).
    expect(
      JSON.parse(String(clients[0].commands[2].values?.[0])),
    ).toMatchObject({ sub: '00000000-0000-4000-8000-000000000009' });
  });

  it.each([
    ['no bearer token', undefined],
    ['a wrong-issuer token', { issuer: 'https://evil.example/auth/v1' }],
    ['a wrong-audience token', { audience: 'anon' }],
    ['an expired token', { expiration: Math.floor(Date.now() / 1000) - 120 }],
    ['a non-authenticated role', { role: 'anon' }],
  ])('fails closed with a non-enumerating 404 for %s', async (_label, overrides) => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const clients: RecordedClient[] = [];
    const createClient = recordingFactory(clients);
    const deps = dependencies({
      verifyAuthenticated: (req, requestEnv, work) =>
        withVerifiedSupabaseTransaction(req, requestEnv, work, {
          key: publicKey,
          createClient,
        }),
    });
    const headers = overrides
      ? { authorization: `Bearer ${await authToken(privateKey, overrides)}` }
      : undefined;
    const { response } = await authRequest(createWorker(deps), env(), headers);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    // A rejected verification never opens a database connection.
    expect(clients).toHaveLength(0);
  });

  it('fails closed with 404, never 500, when the RLS login is unbound', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const deps = dependencies({
      verifyAuthenticated: (req, requestEnv, work) =>
        withVerifiedSupabaseTransaction(req, requestEnv, work, {
          key: publicKey,
        }),
    });
    const { response } = await authRequest(
      createWorker(deps),
      env({ DB_FRESH: undefined }),
      { authorization: `Bearer ${await authToken(privateKey)}` },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });
});
