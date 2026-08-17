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
import { UpstreamAbortError, UpstreamTimeoutError } from './deadline';
import {
  ConfigurationError,
  validateRuntimeConfig,
  type EdgeApiEnv,
  type RuntimeConfig,
} from './env';
import { isCompatibilityPath, proxySupabaseRequest } from './proxy';
import {
  ALERT_EVENTS,
  createTraceId,
  isSelectedForRollout,
  routeClassFor,
  structuredLog,
  trustedRolloutKey,
  type AlertLogEvent,
} from './security';

export interface WorkerDependencies {
  fetcher: typeof fetch;
  queryHyperdrive(
    env: EdgeApiEnv,
    ids: string[],
  ): Promise<CatalogProductSummary[]>;
  queryLegacy(
    env: EdgeApiEnv,
    ids: string[],
    signal?: AbortSignal,
  ): Promise<CatalogProductSummary[]>;
  probe(binding: Hyperdrive | undefined): Promise<boolean>;
  authorizeHealth(request: Request, env: EdgeApiEnv): Promise<boolean>;
  randomUUID(): string;
  cohortKey(request: Request): string;
  log(event: AlertLogEvent): void;
}

const defaultDependencies: WorkerDependencies = {
  fetcher: (input, init) => fetch(input, init),
  queryHyperdrive: queryCatalogViaHyperdrive,
  queryLegacy: queryCatalogViaLegacy,
  probe: probeBinding,
  authorizeHealth: isHealthAuthorized,
  randomUUID: () => crypto.randomUUID(),
  cohortKey: trustedRolloutKey,
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

function logCatalogFailure(
  dependencies: WorkerDependencies,
  event: AlertLogEvent['event'],
  traceId: string,
  fallback?: AlertLogEvent['fallback'],
): void {
  dependencies.log({
    event,
    severity: 'error',
    traceId,
    routeClass: 'catalog.products',
    fallback,
  });
}

async function legacyCatalog(
  request: Request,
  env: EdgeApiEnv,
  ids: string[],
  traceId: string,
  dependencies: WorkerDependencies,
): Promise<Response> {
  try {
    return publicCatalogResponse(
      await dependencies.queryLegacy(env, ids, request.signal),
      traceId,
    );
  } catch {
    logCatalogFailure(
      dependencies,
      ALERT_EVENTS.catalogLegacyFailure,
      traceId,
      'unavailable',
    );
    return privateJson({ error: 'catalog_unavailable' }, 503, traceId);
  }
}

async function handleCatalog(
  request: Request,
  env: EdgeApiEnv,
  config: RuntimeConfig,
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

  if (config.catalogSource === 'legacy') {
    return legacyCatalog(request, env, ids, traceId, dependencies);
  }

  if (config.catalogSource === 'shadow') {
    let legacy: CatalogProductSummary[];
    try {
      legacy = await dependencies.queryLegacy(env, ids, request.signal);
    } catch {
      logCatalogFailure(
        dependencies,
        ALERT_EVENTS.catalogLegacyFailure,
        traceId,
        'unavailable',
      );
      return privateJson({ error: 'catalog_unavailable' }, 503, traceId);
    }
    ctx.waitUntil(
      dependencies
        .queryHyperdrive(env, ids)
        .then((shadow) => {
          if (!catalogResultsMatch(legacy, shadow)) {
            dependencies.log({
              event: ALERT_EVENTS.catalogShadowMismatch,
              severity: 'critical',
              traceId,
              routeClass: 'catalog.products',
              legacyCount: legacy.length,
              hyperdriveCount: shadow.length,
              fallback: 'legacy',
            });
          }
        })
        .catch(() => {
          logCatalogFailure(
            dependencies,
            ALERT_EVENTS.catalogHyperdriveFailure,
            traceId,
            'legacy',
          );
        }),
    );
    return publicCatalogResponse(legacy, traceId);
  }

  const selected = isSelectedForRollout(
    dependencies.cohortKey(request),
    config.catalogHyperdrivePercent,
  );
  if (!selected) return legacyCatalog(request, env, ids, traceId, dependencies);

  const [legacyResult, hyperdriveResult] = await Promise.allSettled([
    dependencies.queryLegacy(env, ids, request.signal),
    dependencies.queryHyperdrive(env, ids),
  ]);
  if (hyperdriveResult.status === 'rejected') {
    logCatalogFailure(
      dependencies,
      ALERT_EVENTS.catalogHyperdriveFailure,
      traceId,
      legacyResult.status === 'fulfilled' ? 'legacy' : 'unavailable',
    );
    if (legacyResult.status === 'fulfilled') {
      return publicCatalogResponse(legacyResult.value, traceId);
    }
    return privateJson({ error: 'catalog_unavailable' }, 503, traceId);
  }

  if (legacyResult.status === 'fulfilled') {
    if (!catalogResultsMatch(legacyResult.value, hyperdriveResult.value)) {
      dependencies.log({
        event: ALERT_EVENTS.catalogShadowMismatch,
        severity: 'critical',
        traceId,
        routeClass: 'catalog.products',
        legacyCount: legacyResult.value.length,
        hyperdriveCount: hyperdriveResult.value.length,
        fallback: 'legacy',
      });
      return publicCatalogResponse(legacyResult.value, traceId);
    }
  } else {
    logCatalogFailure(
      dependencies,
      ALERT_EVENTS.catalogLegacyFailure,
      traceId,
      'hyperdrive_public_view',
    );
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
      const traceId = createTraceId(dependencies.randomUUID);
      const url = new URL(request.url);
      const routeClass = routeClassFor(url.pathname);
      let config: RuntimeConfig;
      try {
        config = validateRuntimeConfig(env);
      } catch (error) {
        if (error instanceof ConfigurationError) {
          dependencies.log({
            event: ALERT_EVENTS.configurationInvalid,
            severity: 'critical',
            traceId,
            routeClass,
            status: 503,
          });
          return privateJson({ error: 'service_unavailable' }, 503, traceId);
        }
        throw error;
      }

      try {
        if (
          request.method === 'GET' &&
          url.pathname === '/v1/catalog/products'
        ) {
          return await handleCatalog(
            request,
            env,
            config,
            ctx,
            traceId,
            dependencies,
          );
        }
        if (request.method === 'GET' && url.pathname === '/_internal/health') {
          return await handleHealth(request, env, traceId, dependencies);
        }
        if (isCompatibilityPath(url.pathname)) {
          return await proxySupabaseRequest(
            request,
            env,
            config,
            traceId,
            dependencies.fetcher,
          );
        }
        return privateJson({ error: 'not_found' }, 404, traceId);
      } catch (error) {
        if (error instanceof UpstreamTimeoutError) {
          dependencies.log({
            event: ALERT_EVENTS.compatibilityTimeout,
            severity: 'error',
            traceId,
            routeClass,
            status: 504,
          });
          return privateJson({ error: 'upstream_timeout' }, 504, traceId);
        }
        if (error instanceof UpstreamAbortError) {
          return privateJson({ error: 'request_aborted' }, 499, traceId);
        }
        dependencies.log({
          event: ALERT_EVENTS.requestFailure,
          severity: 'error',
          traceId,
          routeClass,
          status: 500,
        });
        return privateJson({ error: 'internal_error' }, 500, traceId);
      }
    },
  };
}

export default createWorker();
