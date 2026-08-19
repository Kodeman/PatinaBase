import { readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
import { validateScope } from '../scripts/validate-config.mjs';

// Read the real committed config so the fixtures are complete, valid scopes
// whose ONLY varied field is workers_dev — any workers_dev error is then
// unambiguous.
const config = parse(
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
  [],
  { allowTrailingComma: true },
);

function workersDevErrors(label: string, scope: unknown): string[] {
  const errors: string[] = [];
  validateScope(label, scope, errors);
  return errors.filter((error) => error.includes('workers_dev'));
}

function withWorkersDev(scope: object, value: boolean): object {
  return { ...scope, workers_dev: value };
}

describe('validate-config workers_dev contract', () => {
  it('rejects a production scope with workers_dev:true (second unauthenticated origin)', () => {
    const errors = workersDevErrors(
      'env.production',
      withWorkersDev(config.env.production, true),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('workers_dev must be false');
  });

  it('accepts a production scope with workers_dev:false', () => {
    expect(
      workersDevErrors('env.production', withWorkersDev(config.env.production, false)),
    ).toEqual([]);
  });

  it('rejects a staging scope with workers_dev:false', () => {
    const errors = workersDevErrors(
      'env.staging',
      withWorkersDev(config.env.staging, false),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('workers_dev must be true');
  });

  it('accepts a staging scope with workers_dev:true', () => {
    expect(
      workersDevErrors('env.staging', withWorkersDev(config.env.staging, true)),
    ).toEqual([]);
  });
});

function urlSchemeErrors(label: string, scope: unknown): string[] {
  const errors: string[] = [];
  validateScope(label, scope, errors);
  return errors.filter((error) => error.includes('must be an HTTPS URL'));
}

function withUpstreamUrl(scope: object, value: string): object {
  return withVar(scope, 'SUPABASE_UPSTREAM_URL', value);
}

function withVar(scope: object, name: string, value: string): object {
  return {
    ...scope,
    vars: { ...(scope as { vars: object }).vars, [name]: value },
  };
}

describe('validate-config https scheme contract', () => {
  it('rejects a non-loopback http:// SUPABASE_UPSTREAM_URL', () => {
    const errors = urlSchemeErrors(
      'env.staging',
      withUpstreamUrl(config.env.staging, 'http://api.patina.cloud'),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('SUPABASE_UPSTREAM_URL');
  });

  it('rejects a non-loopback http:// SUPABASE_JWT_ISSUER', () => {
    const errors = urlSchemeErrors(
      'env.staging',
      withVar(config.env.staging, 'SUPABASE_JWT_ISSUER', 'http://api.patina.cloud/auth/v1'),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('SUPABASE_JWT_ISSUER');
  });

  it('rejects a non-loopback http:// SUPABASE_JWKS_URL', () => {
    const errors = urlSchemeErrors(
      'env.staging',
      withVar(
        config.env.staging,
        'SUPABASE_JWKS_URL',
        'http://api.patina.cloud/auth/v1/.well-known/jwks.json',
      ),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('SUPABASE_JWKS_URL');
  });

  it('accepts http://127.0.0.1:54321 (local Supabase CLI)', () => {
    expect(
      urlSchemeErrors(
        'env.local',
        withUpstreamUrl(config.env.local, 'http://127.0.0.1:54321'),
      ),
    ).toEqual([]);
  });

  it('accepts the committed https:// scopes unaffected', () => {
    expect(urlSchemeErrors('env.staging', config.env.staging)).toEqual([]);
    expect(urlSchemeErrors('env.production', config.env.production)).toEqual([]);
  });
});

// The shadow comparison reads DB_CATALOG_FRESH (fresh leg) + DB_PUBLIC_CACHE;
// hyperdrive serves DB_PUBLIC_CACHE; any promoted rung binds DB_FRESH for the
// authenticated path. Build scopes off the complete staging scope so the only
// thing under test is the Hyperdrive binding contract.
function scopeWith(source: string, percent: string, hyperdrive: unknown): object {
  return {
    ...config.env.staging,
    vars: {
      ...config.env.staging.vars,
      CATALOG_SOURCE: source,
      CATALOG_HYPERDRIVE_PERCENT: percent,
    },
    hyperdrive,
  };
}

function errorsFor(label: string, scope: object): string[] {
  const errors: string[] = [];
  validateScope(label, scope, errors);
  return errors;
}

const FRESH = { binding: 'DB_FRESH', id: 'a'.repeat(32) };
const CATALOG_FRESH = { binding: 'DB_CATALOG_FRESH', id: 'b'.repeat(32) };
const PUBLIC_CACHE = { binding: 'DB_PUBLIC_CACHE', id: 'c'.repeat(32) };

describe('validate-config Hyperdrive binding contract', () => {
  it('accepts the three-binding set under a shadow rung', () => {
    expect(
      errorsFor(
        'env.staging',
        scopeWith('shadow', '0', [FRESH, CATALOG_FRESH, PUBLIC_CACHE]),
      ),
    ).toEqual([]);
  });

  it('rejects a shadow rung missing DB_CATALOG_FRESH', () => {
    const errors = errorsFor(
      'env.staging',
      scopeWith('shadow', '0', [FRESH, PUBLIC_CACHE]),
    );
    expect(errors).toContainEqual(
      expect.stringContaining('CATALOG_SOURCE=shadow requires provisioned DB_CATALOG_FRESH'),
    );
  });

  it('accepts a hyperdrive rung without DB_CATALOG_FRESH — the fresh leg is unused there', () => {
    expect(
      errorsFor('env.staging', scopeWith('hyperdrive', '100', [FRESH, PUBLIC_CACHE])),
    ).toEqual([]);
  });

  it('rejects a hyperdrive rung missing DB_PUBLIC_CACHE', () => {
    const errors = errorsFor(
      'env.staging',
      scopeWith('hyperdrive', '100', [FRESH, CATALOG_FRESH]),
    );
    expect(errors).toContainEqual(
      expect.stringContaining('CATALOG_SOURCE=hyperdrive requires a provisioned DB_PUBLIC_CACHE'),
    );
  });

  it('rejects a promoted rung missing DB_FRESH for the authenticated path', () => {
    const errors = errorsFor(
      'env.staging',
      scopeWith('hyperdrive', '100', [CATALOG_FRESH, PUBLIC_CACHE]),
    );
    expect(errors).toContainEqual(
      expect.stringContaining('requires a provisioned DB_FRESH Hyperdrive binding'),
    );
  });

  it('rejects an unknown Hyperdrive binding name', () => {
    const errors = errorsFor(
      'env.staging',
      scopeWith('hyperdrive', '100', [
        FRESH,
        PUBLIC_CACHE,
        { binding: 'DB_UNKNOWN', id: 'd'.repeat(32) },
      ]),
    );
    expect(errors).toContainEqual(expect.stringContaining('must be a subset of'));
  });

  it('rejects an empty Hyperdrive id', () => {
    const errors = errorsFor(
      'env.staging',
      scopeWith('hyperdrive', '100', [
        { binding: 'DB_FRESH', id: '' },
        PUBLIC_CACHE,
      ]),
    );
    expect(errors).toContainEqual(expect.stringContaining('non-empty ids'));
  });

  it('keeps the committed production scope free of routes with workers_dev:false', () => {
    const errors = errorsFor('env.production', config.env.production);
    expect(errors).toEqual([]);
  });
});

// ── The scan read path's config contract ─────────────────────────────────────
// Mirrors validateRuntimeConfig in src/env.ts. Both gates exist because they
// catch the fault at different moments: this one before a deploy leaves the
// laptop, that one at the worker's boot boundary.

function scanErrors(label: string, scope: unknown): string[] {
  const errors: string[] = [];
  validateScope(label, scope, errors);
  return errors.filter((error) => error.includes('SCAN_'));
}

function withVars(
  scope: { vars: Record<string, string> },
  vars: Record<string, unknown>,
) {
  const merged = { ...scope, vars: { ...scope.vars, ...vars } };
  for (const [name, value] of Object.entries(vars)) {
    if (value === undefined) delete merged.vars[name];
  }
  return merged;
}

describe('validate-config scan read path', () => {
  it('accepts every committed scope as-is', () => {
    for (const [label, scope] of [
      ['default', config],
      ['env.local', config.env.local],
      ['env.staging', config.env.staging],
      ['env.production', config.env.production],
    ] as const) {
      expect(scanErrors(label, scope)).toEqual([]);
    }
  });

  it('pins the ruled SCAN_ROUTES posture per scope', () => {
    // The plan ships the read path to STAGING only (459dad4b); default,
    // local, and production stay off — production is off for the whole of
    // it.
    expect(config.vars.SCAN_ROUTES).toBe('off');
    expect(config.env.local.vars.SCAN_ROUTES).toBe('off');
    expect(config.env.staging.vars.SCAN_ROUTES).toBe('on');
    expect(config.env.production.vars.SCAN_ROUTES).toBe('off');
  });

  it('rejects any SCAN_ROUTES value that is not off or on', () => {
    for (const value of ['true', 'ON', '1', '', undefined]) {
      expect(
        scanErrors(
          'env.staging',
          withVars(config.env.staging, { SCAN_ROUTES: value }),
        ),
      ).toContainEqual(expect.stringContaining('SCAN_ROUTES must be'));
    }
  });

  it('rejects an R2 endpoint that is not a bare https origin', () => {
    for (const value of [
      'http://account.r2.cloudflarestorage.com',
      'https://account.r2.cloudflarestorage.com/bucket',
      'account.r2.cloudflarestorage.com',
      '',
    ]) {
      expect(
        scanErrors(
          'env.staging',
          withVars(config.env.staging, { SCAN_R2_ENDPOINT: value }),
        ),
      ).toContainEqual(expect.stringContaining('SCAN_R2_ENDPOINT must be'));
    }
  });

  it('refuses SCAN_ROUTES=on without a provisioned DB_FRESH binding', () => {
    const errors = scanErrors('env.staging', {
      ...withVars(config.env.staging, { SCAN_ROUTES: 'on' }),
      hyperdrive: [],
    });
    expect(errors).toContainEqual(
      expect.stringContaining('SCAN_ROUTES=on requires a provisioned DB_FRESH'),
    );
  });

  it('accepts SCAN_ROUTES=on when DB_FRESH is provisioned', () => {
    expect(
      scanErrors(
        'env.staging',
        withVars(config.env.staging, { SCAN_ROUTES: 'on' }),
      ),
    ).toEqual([]);
  });

  it('refuses the R2 credentials as committed variables', () => {
    for (const name of ['SCAN_R2_ACCESS_KEY_ID', 'SCAN_R2_SECRET_ACCESS_KEY']) {
      const errors: string[] = [];
      validateScope(
        'env.staging',
        withVars(config.env.staging, { [name]: 'leaked' }),
        errors,
      );
      expect(errors).toContainEqual(
        expect.stringContaining(`${name} must be a Wrangler secret`),
      );
    }
  });
});
