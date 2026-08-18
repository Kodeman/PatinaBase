export const ALERT_EVENTS = {
  catalogShadowMatch: 'edge_api_catalog_shadow_match',
  catalogShadowMismatch: 'edge_api_catalog_shadow_mismatch',
  catalogHyperdriveFailure: 'edge_api_catalog_hyperdrive_failure',
  catalogLegacyFailure: 'edge_api_catalog_legacy_failure',
  catalogUnverified: 'edge_api_catalog_unverified_response',
  compatibilityTimeout: 'edge_api_compatibility_timeout',
  configurationInvalid: 'edge_api_configuration_invalid',
  requestFailure: 'edge_api_request_failure',
} as const;

export type AlertEventName = (typeof ALERT_EVENTS)[keyof typeof ALERT_EVENTS];
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type RouteClass =
  | 'catalog.products'
  | 'internal.health'
  | 'auth.check'
  | 'compat.auth'
  | 'compat.realtime'
  | 'compat.rest'
  | 'compat.graphql'
  | 'compat.functions'
  | 'compat.storage'
  | 'unknown';

export type CatalogComparison = 'legacy_vs_cached' | 'legacy_vs_fresh_vs_cached';
export type CatalogBinding =
  | 'DB_FRESH'
  | 'DB_CATALOG_FRESH'
  | 'DB_PUBLIC_CACHE'
  | 'both';

export interface AlertLogEvent {
  event: AlertEventName;
  severity: AlertSeverity;
  traceId: string;
  routeClass: RouteClass;
  fallback?: 'legacy' | 'hyperdrive_public_view' | 'unavailable';
  comparison?: CatalogComparison;
  binding?: CatalogBinding;
  legacyCount?: number;
  freshCount?: number;
  hyperdriveCount?: number;
  mismatchedIdCount?: number;
  legacyDigest?: string;
  freshDigest?: string;
  hyperdriveDigest?: string;
  status?: number;
}

const OPTIONAL_LOG_FIELDS = [
  'fallback',
  'comparison',
  'binding',
  'legacyCount',
  'freshCount',
  'hyperdriveCount',
  'mismatchedIdCount',
  'legacyDigest',
  'freshDigest',
  'hyperdriveDigest',
  'status',
] as const satisfies readonly (keyof AlertLogEvent)[];

export function structuredLog(input: AlertLogEvent): void {
  const event: Record<string, unknown> = {
    event: input.event,
    severity: input.severity,
    traceId: input.traceId,
    routeClass: input.routeClass,
  };
  for (const field of OPTIONAL_LOG_FIELDS) {
    const value = input[field];
    if (value !== undefined) event[field] = value;
  }
  console.log(JSON.stringify(event));
}

export function createTraceId(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return randomUUID();
}

export function routeClassFor(pathname: string): RouteClass {
  if (pathname === '/v1/catalog/products') return 'catalog.products';
  if (pathname === '/v1/_authcheck') return 'auth.check';
  if (pathname === '/_internal/health') return 'internal.health';
  if (pathname === '/auth/v1' || pathname.startsWith('/auth/v1/')) {
    return 'compat.auth';
  }
  if (pathname === '/realtime/v1' || pathname.startsWith('/realtime/v1/')) {
    return 'compat.realtime';
  }
  if (pathname === '/rest/v1' || pathname.startsWith('/rest/v1/')) {
    return 'compat.rest';
  }
  if (pathname === '/graphql/v1' || pathname.startsWith('/graphql/v1/')) {
    return 'compat.graphql';
  }
  if (pathname === '/functions/v1' || pathname.startsWith('/functions/v1/')) {
    return 'compat.functions';
  }
  if (pathname === '/storage/v1' || pathname.startsWith('/storage/v1/')) {
    return 'compat.storage';
  }
  return 'unknown';
}

export function trustedRolloutKey(request: Request): string {
  const cloudflareRequest = request as Request<
    unknown,
    IncomingRequestCfProperties
  >;
  const colo = cloudflareRequest.cf?.colo ?? 'preview';
  const connectingIp = request.headers.get('cf-connecting-ip') ?? 'local';
  return `${colo}:${connectingIp}`;
}

export function rolloutBucket(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function isSelectedForRollout(key: string, percentage: number): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  return rolloutBucket(key) < percentage;
}
