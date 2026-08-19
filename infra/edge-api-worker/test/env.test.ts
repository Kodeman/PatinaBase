import {
  ConfigurationError,
  validateRuntimeConfig,
  type EdgeApiEnv,
} from '../src/env';

// A complete, otherwise-valid legacy-rung env so the only varied field in
// each case is the upstream URL scheme/host under test.
function env(overrides: Partial<EdgeApiEnv> = {}): EdgeApiEnv {
  return {
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
  } as EdgeApiEnv;
}

describe('validateRuntimeConfig https pinning', () => {
  it('rejects a non-loopback http:// SUPABASE_UPSTREAM_URL', () => {
    expect(() =>
      validateRuntimeConfig(
        env({ SUPABASE_UPSTREAM_URL: 'http://api.patina.cloud' }),
      ),
    ).toThrow(ConfigurationError);
  });

  it('rejects a non-loopback http:// SUPABASE_JWT_ISSUER', () => {
    expect(() =>
      validateRuntimeConfig(
        env({ SUPABASE_JWT_ISSUER: 'http://api.patina.cloud/auth/v1' }),
      ),
    ).toThrow(ConfigurationError);
  });

  it('rejects a non-loopback http:// SUPABASE_JWKS_URL', () => {
    expect(() =>
      validateRuntimeConfig(
        env({
          SUPABASE_JWKS_URL:
            'http://api.patina.cloud/auth/v1/.well-known/jwks.json',
        }),
      ),
    ).toThrow(ConfigurationError);
  });

  it('accepts http://127.0.0.1:54321 (local Supabase CLI)', () => {
    expect(() =>
      validateRuntimeConfig(
        env({ SUPABASE_UPSTREAM_URL: 'http://127.0.0.1:54321' }),
      ),
    ).not.toThrow();
  });

  it('accepts http://localhost:54321', () => {
    expect(() =>
      validateRuntimeConfig(
        env({ SUPABASE_UPSTREAM_URL: 'http://localhost:54321' }),
      ),
    ).not.toThrow();
  });

  it('accepts https:// unaffected', () => {
    expect(() =>
      validateRuntimeConfig(
        env({ SUPABASE_UPSTREAM_URL: 'https://project.supabase.co' }),
      ),
    ).not.toThrow();
  });
});
