export type CatalogSource = 'legacy' | 'shadow' | 'hyperdrive';

export interface EdgeApiEnv extends CloudflareBindings {
  // DB_FRESH is the authenticated RLS login (SET ROLE authenticated) for the
  // /v1/_authcheck probe and future authenticated routes. DB_CATALOG_FRESH is
  // the uncached catalog reader the shadow comparison's fresh leg reads. They
  // are two distinct Hyperdrive configs so neither role is overloaded.
  DB_FRESH?: Hyperdrive;
  DB_CATALOG_FRESH?: Hyperdrive;
  DB_PUBLIC_CACHE?: Hyperdrive;
  SUPABASE_ANON_KEY?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  HEALTH_SERVICE_TOKEN_ID?: string;
  HEALTH_SERVICE_TOKEN_SECRET?: string;
}

export interface RuntimeConfig {
  catalogSource: CatalogSource;
  catalogHyperdrivePercent: number;
  legacyFetchTimeoutMs: number;
  compatibilityFetchTimeoutMs: number;
  websocketHandshakeTimeoutMs: number;
}

export class ConfigurationError extends Error {
  constructor() {
    super('invalid worker configuration');
    this.name = 'ConfigurationError';
  }
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigurationError();
  }
  return value;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

// https is required everywhere except loopback so env.local (Supabase CLI on
// http://127.0.0.1:54321) keeps working while a committed http:// value for
// staging/production fails closed here. This also closes a side effect: the
// proxy-loop guard in proxy.ts compares exact origin strings, so an
// http://api.patina.cloud upstream would otherwise evade it.
function requiredHttpUrl(value: unknown): string {
  const candidate = requiredString(value);
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ConfigurationError();
  }
  if (parsed.protocol === 'https:') {
    return candidate;
  }
  if (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname)) {
    return candidate;
  }
  throw new ConfigurationError();
}

function integerInRange(value: unknown, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ConfigurationError();
  }
  return parsed;
}

export function validateRuntimeConfig(env: EdgeApiEnv): RuntimeConfig {
  requiredHttpUrl(env.SUPABASE_UPSTREAM_URL);
  requiredHttpUrl(env.SUPABASE_JWT_ISSUER);
  requiredHttpUrl(env.SUPABASE_JWKS_URL);
  requiredString(env.SUPABASE_JWT_AUDIENCE);
  requiredString(env.SUPABASE_ANON_KEY);

  const source = env.CATALOG_SOURCE;
  if (source !== 'legacy' && source !== 'shadow' && source !== 'hyperdrive') {
    throw new ConfigurationError();
  }
  const percentage = integerInRange(env.CATALOG_HYPERDRIVE_PERCENT, 0, 100);
  if (
    (source === 'legacy' && percentage !== 0) ||
    (source === 'shadow' && percentage !== 0) ||
    (source === 'hyperdrive' && percentage === 0)
  ) {
    throw new ConfigurationError();
  }
  // A promoted rung that boots without the bindings its path uses serves 100%
  // legacy while reporting success; refuse it so a failed cutover is visible.
  // Each source is validated for exactly the bindings it reads:
  //  - shadow compares the fresh leg (DB_CATALOG_FRESH, the uncached catalog
  //    reader) against the cached view (DB_PUBLIC_CACHE), so it needs both.
  //  - hyperdrive serves the cached view (DB_PUBLIC_CACHE); the fresh leg is
  //    not read at rung three.
  //  - any promoted rung also opens DB_FRESH for the authenticated RLS path
  //    (/v1/_authcheck runs SET ROLE authenticated on it), so DB_FRESH must be
  //    bound off the legacy rung.
  if (source === 'shadow' && (!env.DB_CATALOG_FRESH || !env.DB_PUBLIC_CACHE)) {
    throw new ConfigurationError();
  }
  if (source === 'hyperdrive' && !env.DB_PUBLIC_CACHE) {
    throw new ConfigurationError();
  }
  if (source !== 'legacy' && !env.DB_FRESH) {
    throw new ConfigurationError();
  }

  return {
    catalogSource: source,
    catalogHyperdrivePercent: percentage,
    legacyFetchTimeoutMs: integerInRange(
      env.LEGACY_FETCH_TIMEOUT_MS,
      1,
      60_000,
    ),
    compatibilityFetchTimeoutMs: integerInRange(
      env.COMPATIBILITY_FETCH_TIMEOUT_MS,
      1,
      60_000,
    ),
    websocketHandshakeTimeoutMs: integerInRange(
      env.WEBSOCKET_HANDSHAKE_TIMEOUT_MS,
      1,
      30_000,
    ),
  };
}
