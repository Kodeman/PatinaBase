export type CatalogSource = 'legacy' | 'shadow' | 'hyperdrive';

export interface EdgeApiEnv extends CloudflareBindings {
  DB_FRESH?: Hyperdrive;
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

function requiredHttpUrl(value: unknown): string {
  const candidate = requiredString(value);
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ConfigurationError();
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ConfigurationError();
  }
  return candidate;
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
