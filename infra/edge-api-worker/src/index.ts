import type { CatalogProductSummary } from '@patina/types';
import {
  CatalogRequestError,
  catalogDisagreeingIdCount,
  catalogResultsDigest,
  catalogResultsMatch,
  parseCatalogIds,
  queryCatalogViaFresh,
  queryCatalogViaHyperdrive,
  queryCatalogViaLegacy,
} from './catalog';
import { isHealthAuthorized, withVerifiedSupabaseTransaction } from './auth';
import { probeBinding, type DatabaseClient } from './database';
import { UpstreamAbortError, UpstreamTimeoutError } from './deadline';
import {
  ConfigurationError,
  validateRuntimeConfig,
  type EdgeApiEnv,
  type RuntimeConfig,
} from './env';
import { isCompatibilityPath, proxySupabaseRequest } from './proxy';
import { presignR2GetUrl } from './r2';
import {
  parseScanArtifactPath,
  resolveScanArtifacts,
  ScanUnauthorizedError,
  type ScanArtifactKind,
  type ScanArtifactObject,
  type ScanArtifactRequest,
} from './scan';
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
  queryFresh(
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
  verifyAuthenticated<T>(
    request: Request,
    env: EdgeApiEnv,
    work: (client: DatabaseClient) => Promise<T>,
  ): Promise<T>;
  resolveScanArtifacts(
    request: Request,
    env: EdgeApiEnv,
    target: ScanArtifactRequest,
  ): Promise<ScanArtifactObject[]>;
  randomUUID(): string;
  cohortKey(request: Request): string;
  now(): Date;
  log(event: AlertLogEvent): void;
}

const defaultDependencies: WorkerDependencies = {
  fetcher: (input, init) => fetch(input, init),
  queryHyperdrive: queryCatalogViaHyperdrive,
  queryFresh: queryCatalogViaFresh,
  queryLegacy: queryCatalogViaLegacy,
  probe: probeBinding,
  authorizeHealth: isHealthAuthorized,
  verifyAuthenticated: (request, env, work) =>
    withVerifiedSupabaseTransaction(request, env, work),
  resolveScanArtifacts: (request, env, target) =>
    resolveScanArtifacts(request, env, target),
  randomUUID: () => crypto.randomUUID(),
  cohortKey: trustedRolloutKey,
  now: () => new Date(),
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

/**
 * The scan artifact route (`GET /v1/scan/room-files/:id/artifacts/:kind`) is
 * called directly from portal browser JS with a bearer `Authorization` header
 * (`packages/supabase/src/lib/scan-artifact-url.ts`) — a cross-origin request
 * (the portal and this Worker are different origins), so the browser sends a
 * CORS preflight `OPTIONS` before the real `GET`. Nothing on this route ever
 * answered that preflight (no `access-control-*` headers, no `OPTIONS`
 * handling), so every browser call failed with an opaque "Failed to fetch"
 * before a single GET request reached the Worker — confirmed live on staging
 * (`curl -X OPTIONS .../artifacts/renders` → 404, no CORS headers at all).
 * The route carries no cookie/session state of its own (auth is the bearer
 * token, verified server-side against Supabase JWKS), so a wildcard origin
 * leaks nothing a same-origin request wouldn't already get — matching the
 * catalog route's existing `access-control-allow-origin: '*'` precedent.
 */
const SCAN_ARTIFACT_CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '600',
};

function withScanArtifactCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SCAN_ARTIFACT_CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function catalogResponse(
  products: CatalogProductSummary[],
  traceId: string,
  verified = true,
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
      // An unverified body is a single uncompared read: serve it for
      // availability, but never let a shared cache retain it.
      'cache-control': verified
        ? 'public, max-age=60, stale-while-revalidate=15'
        : 'private, no-store',
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
    return catalogResponse(
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
      Promise.allSettled([
        dependencies.queryFresh(env, ids),
        dependencies.queryHyperdrive(env, ids),
      ]).then(([freshResult, cachedResult]) => {
        if (
          freshResult.status === 'rejected' ||
          cachedResult.status === 'rejected'
        ) {
          dependencies.log({
            event: ALERT_EVENTS.catalogHyperdriveFailure,
            severity: 'error',
            traceId,
            routeClass: 'catalog.products',
            binding: failingBinding(
              freshResult.status === 'rejected',
              cachedResult.status === 'rejected',
            ),
            fallback: 'legacy',
          });
          return;
        }
        logComparison(dependencies, traceId, 'legacy_vs_fresh_vs_cached', {
          legacy,
          fresh: freshResult.value,
          cached: cachedResult.value,
        });
      }),
    );
    return catalogResponse(legacy, traceId);
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
      return catalogResponse(legacyResult.value, traceId);
    }
    return privateJson({ error: 'catalog_unavailable' }, 503, traceId);
  }

  if (legacyResult.status === 'rejected') {
    // The comparison that authorizes serving the public view never ran.
    dependencies.log({
      event: ALERT_EVENTS.catalogUnverified,
      severity: 'critical',
      traceId,
      routeClass: 'catalog.products',
      fallback: 'hyperdrive_public_view',
    });
    return catalogResponse(hyperdriveResult.value, traceId, false);
  }

  const matched = logComparison(dependencies, traceId, 'legacy_vs_cached', {
    legacy: legacyResult.value,
    cached: hyperdriveResult.value,
  });
  return catalogResponse(
    matched ? hyperdriveResult.value : legacyResult.value,
    traceId,
  );
}

function failingBinding(
  freshFailed: boolean,
  cachedFailed: boolean,
): 'DB_CATALOG_FRESH' | 'DB_PUBLIC_CACHE' | 'both' {
  if (freshFailed && cachedFailed) return 'both';
  // The shadow fresh leg reads DB_CATALOG_FRESH (the catalog reader), not
  // DB_FRESH (the RLS login) — point an operator at the binding that failed.
  return freshFailed ? 'DB_CATALOG_FRESH' : 'DB_PUBLIC_CACHE';
}

function logComparison(
  dependencies: WorkerDependencies,
  traceId: string,
  comparison: 'legacy_vs_cached' | 'legacy_vs_fresh_vs_cached',
  sides: {
    legacy: CatalogProductSummary[];
    fresh?: CatalogProductSummary[];
    cached: CatalogProductSummary[];
  },
): boolean {
  const compared = sides.fresh
    ? [sides.legacy, sides.fresh, sides.cached]
    : [sides.legacy, sides.cached];
  const matched = compared.every((side) =>
    catalogResultsMatch(sides.legacy, side),
  );
  dependencies.log({
    event: matched
      ? ALERT_EVENTS.catalogShadowMatch
      : ALERT_EVENTS.catalogShadowMismatch,
    severity: matched ? 'info' : 'critical',
    traceId,
    routeClass: 'catalog.products',
    comparison,
    legacyCount: sides.legacy.length,
    ...(sides.fresh ? { freshCount: sides.fresh.length } : {}),
    hyperdriveCount: sides.cached.length,
    legacyDigest: catalogResultsDigest(sides.legacy),
    ...(sides.fresh ? { freshDigest: catalogResultsDigest(sides.fresh) } : {}),
    hyperdriveDigest: catalogResultsDigest(sides.cached),
    ...(matched
      ? {}
      : {
          mismatchedIdCount: catalogDisagreeingIdCount(compared),
          fallback: 'legacy' as const,
        }),
  });
  return matched;
}

async function handleAuthCheck(
  request: Request,
  env: EdgeApiEnv,
  traceId: string,
  dependencies: WorkerDependencies,
): Promise<Response> {
  try {
    await dependencies.verifyAuthenticated(request, env, async (client) => {
      // Data-free: this exercises the verified-JWT -> SET ROLE authenticated ->
      // set_config('request.jwt.claims', ...) chain without reading any
      // application table. The row is discarded and never returned.
      await client.query(
        "SELECT current_user, current_setting('request.jwt.claims', true)",
      );
    });
  } catch {
    // Every failure mode — missing/invalid/expired/wrong-issuer/wrong-audience/
    // wrong-role token, or an unavailable RLS login — collapses to the worker's
    // non-enumerating not_found. Never a 500, and never any detail about which
    // check failed or the claims/user behind a valid token.
    return privateJson({ error: 'not_found' }, 404, traceId);
  }
  return privateJson({ ok: true }, 200, traceId);
}

/**
 * How long a scan capability URL lives. Ten minutes: long enough for a splat of
 * a few hundred megabytes to finish downloading over a poor connection, short
 * enough that a URL copied out of a network tab is worthless by the time it is
 * pasted anywhere. Fixed rather than configurable — a per-environment TTL is a
 * knob whose only use is making the capability last longer.
 */
const SCAN_URL_TTL_SECONDS = 600;

async function signScanArtifact(
  env: EdgeApiEnv,
  object: ScanArtifactObject,
  now: Date,
): Promise<{ url: string; expiresAt: string }> {
  return presignR2GetUrl({
    endpoint: env.SCAN_R2_ENDPOINT,
    bucket: object.bucket,
    objectKey: object.objectKey,
    accessKeyId: env.SCAN_R2_ACCESS_KEY_ID as string,
    secretAccessKey: env.SCAN_R2_SECRET_ACCESS_KEY as string,
    expiresInSeconds: SCAN_URL_TTL_SECONDS,
    now,
  });
}

async function handleScanArtifact(
  request: Request,
  env: EdgeApiEnv,
  target: ScanArtifactRequest,
  traceId: string,
  dependencies: WorkerDependencies,
): Promise<Response> {
  let objects: ScanArtifactObject[];
  try {
    objects = await dependencies.resolveScanArtifacts(request, env, target);
  } catch (error) {
    if (error instanceof ScanUnauthorizedError) {
      // The one negative that is about the CALLER rather than about data. Every
      // other outcome below is an identical 404 — never a 403, which would
      // confirm the Room File exists.
      return privateJson({ error: 'unauthorized' }, 401, traceId);
    }
    dependencies.log({
      event: ALERT_EVENTS.scanArtifactFailure,
      severity: 'error',
      traceId,
      routeClass: 'scan.artifact',
      artifactKind: target.kind,
      status: 503,
    });
    return privateJson({ error: 'scan_artifact_unavailable' }, 503, traceId);
  }

  if (objects.length === 0) {
    return privateJson({ error: 'not_found' }, 404, traceId);
  }

  const now = dependencies.now();
  let signed: Array<{ shot: string; url: string; expiresAt: string }>;
  try {
    signed = await Promise.all(
      objects.map(async (object) => ({
        shot: object.shot,
        ...(await signScanArtifact(env, object, now)),
      })),
    );
  } catch {
    // A presign failure is a configuration or credential fault, never a
    // statement about this caller — and the error carries key material context,
    // so nothing about it is logged beyond the event itself.
    dependencies.log({
      event: ALERT_EVENTS.scanArtifactFailure,
      severity: 'error',
      traceId,
      routeClass: 'scan.artifact',
      artifactKind: target.kind,
      status: 503,
    });
    return privateJson({ error: 'scan_artifact_unavailable' }, 503, traceId);
  }

  return privateJson(scanArtifactBody(target.kind, signed), 200, traceId);
}

function scanArtifactBody(
  kind: ScanArtifactKind,
  signed: Array<{ shot: string; url: string; expiresAt: string }>,
): unknown {
  if (kind === 'renders') {
    return {
      kind,
      shots: Object.fromEntries(
        signed.map(({ shot, url, expiresAt }) => [shot, { url, expiresAt }]),
      ),
    };
  }
  const [only] = signed;
  return { kind, url: only.url, expiresAt: only.expiresAt };
}

type BindingCheck = 'ok' | 'unavailable' | 'not_applicable';

async function checkBinding(
  binding: Hyperdrive | undefined,
  required: boolean,
  dependencies: WorkerDependencies,
): Promise<BindingCheck> {
  // An unbound binding on rung one is the correct steady state, not a fault.
  // A binding the config declares must answer, whatever the source is.
  if (!binding && !required) return 'not_applicable';
  return (await dependencies.probe(binding)) ? 'ok' : 'unavailable';
}

async function handleHealth(
  request: Request,
  env: EdgeApiEnv,
  config: RuntimeConfig,
  traceId: string,
  dependencies: WorkerDependencies,
): Promise<Response> {
  if (!(await dependencies.authorizeHealth(request, env))) {
    return privateJson({ error: 'not_found' }, 404, traceId);
  }
  const required = config.catalogSource !== 'legacy';
  // Only shadow reads the fresh leg (DB_CATALOG_FRESH); legacy and hyperdrive
  // never do, so the reader is not_applicable there even if it is bound. In
  // shadow it must answer, or every comparison silently runs one-legged.
  const [fresh, publicCache, catalogFresh] = await Promise.all([
    checkBinding(env.DB_FRESH, required, dependencies),
    checkBinding(env.DB_PUBLIC_CACHE, required, dependencies),
    config.catalogSource === 'shadow'
      ? checkBinding(env.DB_CATALOG_FRESH, true, dependencies)
      : Promise.resolve<BindingCheck>('not_applicable'),
  ]);
  const healthy =
    fresh !== 'unavailable' &&
    publicCache !== 'unavailable' &&
    catalogFresh !== 'unavailable';
  return privateJson(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: { fresh, publicCache, catalogFresh },
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
        if (request.method === 'GET' && url.pathname === '/v1/_authcheck') {
          return await handleAuthCheck(request, env, traceId, dependencies);
        }
        // SCAN_ROUTES=off leaves the path unrouted entirely, so it falls through
        // to the same not_found any unknown path gets: an environment that has
        // not turned the read path on does not advertise that it exists.
        if (
          config.scanRoutes === 'on' &&
          (request.method === 'GET' || request.method === 'OPTIONS')
        ) {
          const target = parseScanArtifactPath(url.pathname);
          if (target) {
            // Browser JS calls this route cross-origin with an `Authorization`
            // header, which triggers a CORS preflight — answer it here rather
            // than falling through to the generic not_found every other
            // unmatched OPTIONS request gets.
            if (request.method === 'OPTIONS') {
              return new Response(null, {
                status: 204,
                headers: SCAN_ARTIFACT_CORS_HEADERS,
              });
            }
            return withScanArtifactCors(
              await handleScanArtifact(request, env, target, traceId, dependencies),
            );
          }
        }
        if (request.method === 'GET' && url.pathname === '/_internal/health') {
          return await handleHealth(request, env, config, traceId, dependencies);
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
