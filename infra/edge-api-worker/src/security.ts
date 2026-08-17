export const ALERT_EVENTS = {
  catalogShadowMismatch: 'edge_api_catalog_shadow_mismatch',
  catalogHyperdriveFailure: 'edge_api_catalog_hyperdrive_failure',
  catalogLegacyFailure: 'edge_api_catalog_legacy_failure',
  compatibilityTimeout: 'edge_api_compatibility_timeout',
  configurationInvalid: 'edge_api_configuration_invalid',
  requestFailure: 'edge_api_request_failure',
} as const;

export type AlertEventName = (typeof ALERT_EVENTS)[keyof typeof ALERT_EVENTS];
export type AlertSeverity = 'warning' | 'error' | 'critical';
export type RouteClass =
  | 'catalog.products'
  | 'internal.health'
  | 'compat.auth'
  | 'compat.realtime'
  | 'compat.rest'
  | 'compat.graphql'
  | 'compat.functions'
  | 'compat.storage'
  | 'unknown';

export interface AlertLogEvent {
  event: AlertEventName;
  severity: AlertSeverity;
  traceId: string;
  routeClass: RouteClass;
  fallback?: 'legacy' | 'hyperdrive_public_view' | 'unavailable';
  legacyCount?: number;
  hyperdriveCount?: number;
  status?: number;
}

export function structuredLog(input: AlertLogEvent): void {
  const event: AlertLogEvent = {
    event: input.event,
    severity: input.severity,
    traceId: input.traceId,
    routeClass: input.routeClass,
  };
  if (input.fallback !== undefined) event.fallback = input.fallback;
  if (input.legacyCount !== undefined) event.legacyCount = input.legacyCount;
  if (input.hyperdriveCount !== undefined) {
    event.hyperdriveCount = input.hyperdriveCount;
  }
  if (input.status !== undefined) event.status = input.status;
  console.log(JSON.stringify(event));
}

export function createTraceId(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return randomUUID();
}

export function routeClassFor(pathname: string): RouteClass {
  if (pathname === '/v1/catalog/products') return 'catalog.products';
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
