import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, printParseErrorCode } from 'jsonc-parser';

const errors = [];
const configText = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const parseErrors = [];
const config = parse(configText, parseErrors, { allowTrailingComma: true });

for (const error of parseErrors) {
  errors.push(`wrangler.jsonc: ${printParseErrorCode(error.error)}`);
}

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
];
const requiredSecrets = ['SUPABASE_ANON_KEY'];

function validateScope(label, scope) {
  if (scope.workers_dev !== true) {
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
  for (const name of requiredSecrets) {
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
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    } catch {
      errors.push(`${label}: ${name} must be an HTTP(S) URL`);
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
  if (!Array.isArray(scope.hyperdrive)) {
    errors.push(`${label}: hyperdrive must be an explicit array`);
  } else if (scope.hyperdrive.length !== 0) {
    const bindings = new Set(scope.hyperdrive.map((entry) => entry?.binding));
    if (
      scope.hyperdrive.length !== 2 ||
      !bindings.has('DB_FRESH') ||
      !bindings.has('DB_PUBLIC_CACHE') ||
      scope.hyperdrive.some((entry) => typeof entry?.id !== 'string' || entry.id.length === 0)
    ) {
      errors.push(`${label}: provisioned Hyperdrive entries must be exactly DB_FRESH and DB_PUBLIC_CACHE`);
    }
  }
}

validateScope('default', config);
for (const name of ['local', 'staging', 'production']) {
  if (!config.env?.[name]) errors.push(`missing env.${name}`);
  else validateScope(`env.${name}`, config.env[name]);
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
        for (const name of requiredSecrets) {
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
