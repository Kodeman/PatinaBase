import type { CatalogProductSummary } from '@patina/types';
import {
  CatalogRequestError,
  catalogResultsMatch,
  parseCatalogIds,
  queryCatalogViaHyperdrive,
  queryCatalogViaLegacy,
} from './catalog';
import { isHealthAuthorized } from './auth';
import { probeBinding } from './database';
import type { EdgeApiEnv } from './env';
import { isCompatibilityPath, proxySupabaseRequest } from './proxy';
import {
  clampPercentage,
  isEnabled,
  isSelectedForRollout,
  structuredLog,
  traceIdFor,
} from './security';

export interface WorkerDependencies {
  fetcher: typeof fetch;
  queryHyperdrive(
    env: EdgeApiEnv,
    ids: string[],
  ): Promise<CatalogProductSummary[]>;
  queryLegacy(env: EdgeApiEnv, ids: string[]): Promise<CatalogProductSummary[]>;
  probe(binding: Hyperdrive | undefined): Promise<boolean>;
  authorizeHealth(request: Request, env: EdgeApiEnv): Promise<boolean>;
  randomUUID(): string;
  log(event: Record<string, unknown>): void;
}

const defaultDependencies: WorkerDependencies = {
  fetcher: fetch,
  queryHyperdrive: queryCatalogViaHyperdrive,
  queryLegacy: queryCatalogViaLegacy,
  probe: probeBinding,
  authorizeHealth: isHealthAuthorized,
  randomUUID: crypto.randomUUID,
  log: structuredLog,
};

function privateJson(body: unknown, status: number, traceId: string): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'private, no-store',
      'x-patina-trace-id': traceId,
    },
  });
}

async function publicCatalogResponse(
  products: CatalogProductSummary[],
  traceId: string,
): Promise<Response> {
  const body = JSON.stringify(products);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body),
  );
  const etag = `"${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}"`;
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60, stale-while-revalidate=15',
      etag,
      'access-control-allow-origin': '*',
      'x-patina-trace-id': traceId,
    },
  });
}

function rolloutKey(request: Request): string {
  return (
    request.headers.get('x-patina-rollout-key') ??
    request.headers.get('cf-connecting-ip') ??
    request.url
  );
}

async function handleCatalog(
  request: Request,
  env: EdgeApiEnv,
  ctx: ExecutionContext,
  traceId: string,
  dependencies: WorkerDependencies,
): Promise<Response> {
  let ids: string[];
  try {
    ids = parseCatalogIds(new URL(request.url));
  } catch (error) {
    if (error instanceof CatalogRequestError) {
      return privateJson(
        { error: 'invalid_request', message: error.message },
        400,
        traceId,
      );
    }
    throw error;
  }

  const percentage = clampPercentage(env.CATALOG_HYPERDRIVE_PERCENT);
  const selected =
    env.CATALOG_SOURCE === 'hyperdrive' &&
    isSelectedForRollout(rolloutKey(request), percentage);

  if (!selected) {
    try {
      const legacy = await dependencies.queryLegacy(env, ids);
      if (isEnabled(env.CATALOG_SHADOW_ENABLED)) {
        ctx.waitUntil(
          dependencies
            .queryHyperdrive(env, ids)
            .then((shadow) => {
              if (!catalogResultsMatch(legacy, shadow)) {
                dependencies.log({
                  event: 'catalog_shadow_mismatch',
                  traceId,
                  route: '/v1/catalog/products',
                  legacyCount: legacy.length,
                  hyperdriveCount: shadow.length,
                });
              }
            })
            .catch(() => {
              dependencies.log({
                event: 'catalog_hyperdrive_failure',
                traceId,
                route: '/v1/catalog/products',
                fallback: 'legacy',
              });
            }),
        );
      }
      return publicCatalogResponse(legacy, traceId);
    } catch {
      dependencies.log({
        event: 'catalog_legacy_failure',
        traceId,
        route: '/v1/catalog/products',
      });
      return privateJson({ error: 'catalog_unavailable' }, 503, traceId);
    }
  }

  const [legacyResult, hyperdriveResult] = await Promise.allSettled([
    dependencies.queryLegacy(env, ids),
    dependencies.queryHyperdrive(env, ids),
  ]);
  if (hyperdriveResult.status === 'rejected') {
    dependencies.log({
      event: 'catalog_hyperdrive_failure',
      traceId,
      route: '/v1/catalog/products',
      fallback: legacyResult.status === 'fulfilled' ? 'legacy' : 'unavailable',
    });
    if (legacyResult.status === 'fulfilled') {
      return publicCatalogResponse(legacyResult.value, traceId);
    }
    return privateJson({ error: 'catalog_unavailable' }, 503, traceId);
  }

  if (legacyResult.status === 'fulfilled') {
    if (!catalogResultsMatch(legacyResult.value, hyperdriveResult.value)) {
      dependencies.log({
        event: 'catalog_shadow_mismatch',
        traceId,
        route: '/v1/catalog/products',
        legacyCount: legacyResult.value.length,
        hyperdriveCount: hyperdriveResult.value.length,
        fallback: 'legacy',
      });
      return publicCatalogResponse(legacyResult.value, traceId);
    }
  } else {
    dependencies.log({
      event: 'catalog_legacy_failure',
      traceId,
      route: '/v1/catalog/products',
      fallback: 'hyperdrive_public_view',
    });
  }
  return publicCatalogResponse(hyperdriveResult.value, traceId);
}

async function handleHealth(
  request: Request,
  env: EdgeApiEnv,
  traceId: string,
  dependencies: WorkerDependencies,
): Promise<Response> {
  if (!(await dependencies.authorizeHealth(request, env))) {
    return privateJson({ error: 'not_found' }, 404, traceId);
  }
  const [fresh, publicCache] = await Promise.all([
    dependencies.probe(env.DB_FRESH),
    dependencies.probe(env.DB_PUBLIC_CACHE),
  ]);
  const healthy = fresh && publicCache;
  return privateJson(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: {
        fresh: fresh ? 'ok' : 'unavailable',
        publicCache: publicCache ? 'ok' : 'unavailable',
      },
    },
    healthy ? 200 : 503,
    traceId,
  );
}

export function createWorker(
  overrides: Partial<WorkerDependencies> = {},
): ExportedHandler<EdgeApiEnv> {
  const dependencies = { ...defaultDependencies, ...overrides };
  return {
    async fetch(request, env, ctx): Promise<Response> {
      const traceId = traceIdFor(request, dependencies.randomUUID);
      const url = new URL(request.url);
      try {
        if (
          request.method === 'GET' &&
          url.pathname === '/v1/catalog/products'
        ) {
          return await handleCatalog(request, env, ctx, traceId, dependencies);
        }
        if (request.method === 'GET' && url.pathname === '/_internal/health') {
          return await handleHealth(request, env, traceId, dependencies);
        }
        if (isCompatibilityPath(url.pathname)) {
          return await proxySupabaseRequest(
            request,
            env,
            traceId,
            dependencies.fetcher,
          );
        }
        return privateJson({ error: 'not_found' }, 404, traceId);
      } catch {
        dependencies.log({
          event: 'request_failure',
          traceId,
          route: url.pathname,
        });
        return privateJson({ error: 'internal_error' }, 500, traceId);
      }
    },
  };
}

export default createWorker();
