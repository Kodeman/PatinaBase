import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, printParseErrorCode } from 'jsonc-parser';

const requiredVars = [
  'SUPABASE_UPSTREAM_URL',
  'SUPABASE_JWT_ISSUER',
  'SUPABASE_JWT_AUDIENCE',
  'SUPABASE_JWKS_URL',
  'CATALOG_SOURCE',
  'CATALOG_HYPERDRIVE_PERCENT',
  'LEGACY_FETCH_TIMEOUT_MS',
  'COMPATIBILITY_FETCH_TIMEOUT_MS',
  'WEBSOCKET_HANDSHAKE_TIMEOUT_MS',
  'SCAN_ROUTES',
  'SCAN_R2_ENDPOINT',
  'SCAN_R2_BUCKET',
];
// Every name here must be a Wrangler secret and must never appear in `vars`.
// The scan credentials are additionally CONDITIONAL for the --provisioned
// inventory: they are only required where SCAN_ROUTES is "on", so an
// environment resting at "off" stays provisionable without them.
const requiredSecrets = ['SUPABASE_ANON_KEY'];
const scanSecrets = ['SCAN_R2_ACCESS_KEY_ID', 'SCAN_R2_SECRET_ACCESS_KEY'];
const KNOWN_HYPERDRIVE_BINDINGS = new Set([
  'DB_FRESH',
  'DB_CATALOG_FRESH',
  'DB_PUBLIC_CACHE',
]);

export function validateScope(label, scope, errors) {
  // Production must NOT expose a second, unauthenticated *.workers.dev origin:
  // it is reachable only via the future api.patina.cloud route. Every other
  // scope keeps workers_dev true until a route attachment is approved.
  if (label === 'env.production') {
    if (scope.workers_dev !== false) {
      errors.push(
        `${label}: workers_dev must be false — production must not expose a second unauthenticated *.workers.dev origin`,
      );
    }
  } else if (scope.workers_dev !== true) {
    errors.push(`${label}: workers_dev must be true until route attachment is approved`);
  }
  if ('routes' in scope || 'route' in scope) {
    errors.push(`${label}: committed route attachment is forbidden`);
  }
  for (const name of requiredVars) {
    if (typeof scope.vars?.[name] !== 'string' || scope.vars[name].trim() === '') {
      errors.push(`${label}: missing ${name}`);
    }
  }
  for (const name of [...requiredSecrets, ...scanSecrets]) {
    if (Object.hasOwn(scope.vars ?? {}, name)) {
      errors.push(`${label}: ${name} must be a Wrangler secret, not a committed variable`);
    }
  }
  for (const name of [
    'SUPABASE_UPSTREAM_URL',
    'SUPABASE_JWT_ISSUER',
    'SUPABASE_JWKS_URL',
  ]) {
    try {
      const url = new URL(scope.vars?.[name]);
      const isLoopbackHost = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
      // https is required everywhere except loopback (mirrors requiredHttpUrl
      // in src/env.ts) so env.local keeps http://127.0.0.1:54321 while a
      // committed http:// value for staging/production fails closed here.
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost)) {
        throw new Error();
      }
    } catch {
      errors.push(
        `${label}: ${name} must be an HTTPS URL (http allowed only for 127.0.0.1/localhost)`,
      );
    }
  }
  const source = scope.vars?.CATALOG_SOURCE;
  const percentage = Number(scope.vars?.CATALOG_HYPERDRIVE_PERCENT);
  if (!['legacy', 'shadow', 'hyperdrive'].includes(source)) {
    errors.push(`${label}: invalid CATALOG_SOURCE`);
  }
  if (
    !Number.isInteger(percentage) ||
    percentage < 0 ||
    percentage > 100 ||
    ((source === 'legacy' || source === 'shadow') && percentage !== 0) ||
    (source === 'hyperdrive' && percentage === 0)
  ) {
    errors.push(`${label}: invalid catalog source/percentage state`);
  }
  for (const name of [
    'LEGACY_FETCH_TIMEOUT_MS',
    'COMPATIBILITY_FETCH_TIMEOUT_MS',
    'WEBSOCKET_HANDSHAKE_TIMEOUT_MS',
  ]) {
    const timeout = Number(scope.vars?.[name]);
    const maximum = name === 'WEBSOCKET_HANDSHAKE_TIMEOUT_MS' ? 30_000 : 60_000;
    if (!Number.isInteger(timeout) || timeout <= 0 || timeout > maximum) {
      errors.push(`${label}: invalid ${name}`);
    }
  }
  // The scan read path, mirroring validateRuntimeConfig in src/env.ts. The R2
  // endpoint must be a bare https origin — a path component would change the
  // object a signature covers — and there is no loopback exemption because R2
  // has no local stand-in.
  const scanRoutes = scope.vars?.SCAN_ROUTES;
  if (scanRoutes !== 'off' && scanRoutes !== 'on') {
    errors.push(`${label}: SCAN_ROUTES must be "off" or "on"`);
  }
  try {
    const endpoint = new URL(scope.vars?.SCAN_R2_ENDPOINT);
    if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/') throw new Error();
  } catch {
    errors.push(`${label}: SCAN_R2_ENDPOINT must be an https origin with no path`);
  }

  let provisionedBindings = new Set();
  if (!Array.isArray(scope.hyperdrive)) {
    errors.push(`${label}: hyperdrive must be an explicit array`);
  } else if (scope.hyperdrive.length !== 0) {
    const names = scope.hyperdrive.map((entry) => entry?.binding);
    const bindings = new Set(names);
    const unknown = names.filter((name) => !KNOWN_HYPERDRIVE_BINDINGS.has(name));
    const malformedId = scope.hyperdrive.some(
      (entry) => typeof entry?.id !== 'string' || entry.id.length === 0,
    );
    if (unknown.length > 0 || malformedId || names.length !== bindings.size) {
      errors.push(
        `${label}: provisioned Hyperdrive entries must be a subset of ${[...KNOWN_HYPERDRIVE_BINDINGS].join(', ')} with unique, non-empty ids`,
      );
    } else {
      provisionedBindings = bindings;
    }
  }
  // A promoted rung with no provisioned bindings deploys clean and silently
  // serves 100% legacy, which is indistinguishable from a successful cutover.
  // Require exactly the bindings each source's path reads, mirroring
  // validateRuntimeConfig in src/env.ts:
  //  - shadow compares DB_CATALOG_FRESH (fresh leg) with DB_PUBLIC_CACHE.
  //  - hyperdrive serves DB_PUBLIC_CACHE.
  //  - any promoted rung opens DB_FRESH for the authenticated /v1/_authcheck path.
  if (
    source === 'shadow' &&
    (!provisionedBindings.has('DB_CATALOG_FRESH') || !provisionedBindings.has('DB_PUBLIC_CACHE'))
  ) {
    errors.push(
      `${label}: CATALOG_SOURCE=shadow requires provisioned DB_CATALOG_FRESH and DB_PUBLIC_CACHE Hyperdrive bindings`,
    );
  }
  if (source === 'hyperdrive' && !provisionedBindings.has('DB_PUBLIC_CACHE')) {
    errors.push(
      `${label}: CATALOG_SOURCE=hyperdrive requires a provisioned DB_PUBLIC_CACHE Hyperdrive binding`,
    );
  }
  if (
    (source === 'shadow' || source === 'hyperdrive') &&
    !provisionedBindings.has('DB_FRESH')
  ) {
    errors.push(
      `${label}: CATALOG_SOURCE=${source} requires a provisioned DB_FRESH Hyperdrive binding for the authenticated path`,
    );
  }
  // SCAN_ROUTES=on reads user-scoped rows under the caller's RLS on the
  // uncached login. Without DB_FRESH the route could only ever 404, which is
  // indistinguishable from "this scan has no artifacts" — the same silent-
  // failure shape the catalog rungs above are written to prevent.
  if (scanRoutes === 'on' && !provisionedBindings.has('DB_FRESH')) {
    errors.push(
      `${label}: SCAN_ROUTES=on requires a provisioned DB_FRESH Hyperdrive binding`,
    );
  }
}

function main() {
  const errors = [];
  const configText = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const parseErrors = [];
  const config = parse(configText, parseErrors, { allowTrailingComma: true });

  for (const error of parseErrors) {
    errors.push(`wrangler.jsonc: ${printParseErrorCode(error.error)}`);
  }

  validateScope('default', config, errors);
  for (const name of ['local', 'staging', 'production']) {
    if (!config.env?.[name]) errors.push(`missing env.${name}`);
    else validateScope(`env.${name}`, config.env[name], errors);
  }

  const provisionedFlag = process.argv.indexOf('--provisioned');
  if (provisionedFlag !== -1 && errors.length === 0) {
    const environment = process.argv[provisionedFlag + 1];
    if (!['default', 'local', 'staging', 'production'].includes(environment)) {
      errors.push('provisioned secret check requires default, local, staging, or production');
    } else {
      const wrangler = fileURLToPath(
        new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
      );
      const args = [wrangler, 'secret', 'list', '--format', 'json'];
      if (environment === 'default') args.push('--env=');
      else args.push('--env', environment);
      const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
      if (result.status !== 0) {
        errors.push(`env.${environment}: unable to verify Wrangler secrets`);
      } else {
        try {
          const parsed = JSON.parse(result.stdout);
          const secrets = Array.isArray(parsed) ? parsed : parsed.secrets;
          const names = new Set(secrets.map((secret) => secret.name));
          const scope = environment === 'default' ? config : config.env?.[environment];
          const expected = [
            ...requiredSecrets,
            ...(scope?.vars?.SCAN_ROUTES === 'on' ? scanSecrets : []),
          ];
          for (const name of expected) {
            if (!names.has(name)) errors.push(`env.${environment}: missing Wrangler secret ${name}`);
          }
        } catch {
          errors.push(`env.${environment}: Wrangler secret inventory was malformed`);
        }
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }

  console.log(
    'Wrangler config contract: 4 environments complete; no attached routes; SUPABASE_ANON_KEY required as an environment-specific secret',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
