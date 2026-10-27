import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const inputRoot = '/tmp/round8-input/';
// Each overlay removes exactly one native coverage conjunct; never replace the reader wholesale.
const coverageControls = {
  'n1a.sql': ' AND r.id::text=revision_id',
  'n1b.sql': " AND (c->>'unit')=ANY(b.units)",
  'n1c.sql': 'mm.manifest_id=e.manifest_id AND ',
  'n1d.sql': `         AND b.covers_plan_issue_id IS NOT DISTINCT FROM
          (SELECT issued.plan_issue_id FROM events issued
           WHERE issued.fulfilment_id=e.fulfilment_id AND issued.event_kind='package_issued'
            AND issued.event_seq<e.event_seq AND f.kind='gc_cabinetry'
           ORDER BY issued.event_seq DESC LIMIT 1)
`,
  'n1e.sql': ' AND b.fulfilment_id=e.fulfilment_id',
  'n1f.sql': ' AND issued.event_seq<e.event_seq',
  'n1g.sql': 'issued.fulfilment_id=e.fulfilment_id AND ',
  'n1h.sql': " AND f.kind='gc_cabinetry'",
  'n1i.sql': " AND pinned->>'id'=f.configuration_id::text",
  'n1j.sql': "pinned->>'kind'='product_configuration' AND ",
};
const controls = ['old-reader.sql', 'deleted-bindings.sql', 'deleted-receipts.sql', ...Object.keys(coverageControls)];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Host-psql race suites: ROUND8_DB_URL may name another local stack, never a non-loopback host.
// libpq honours host/hostaddr/service query parameters and comma host lists, so the URL must be
// a plain loopback URI with no query, fragment or list.
export const defaultDbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export function round8DbUrl(env = process.env) {
  const value = env.ROUND8_DB_URL ?? defaultDbUrl;
  let url;
  try { url = new URL(value); } catch { url = undefined; }
  if (!url || !['postgresql:', 'postgres:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.search || url.hash || !/^\/[A-Za-z0-9_]+$/.test(url.pathname)) {
    throw new Error('ROUND8_DB_URL must be a postgresql:// URL on 127.0.0.1 or localhost');
  }
  return value;
}
// The owned-container ticket label has no default: the suite must be told which provisioning it may use.
export function round8OwnerTicket(env = process.env) {
  if (!/^SQ-[1-9][0-9]*$/.test(env.ROUND8_OWNER_TICKET ?? '')) throw new Error('ROUND8_OWNER_TICKET must name the provisioning ticket');
  return env.ROUND8_OWNER_TICKET;
}
// A plain database name only: psql -d expands a value containing = or a URI prefix into a connection string.
export function round8CloneDb(env = process.env) {
  const value = env.ROUND8_CLONE_DB ?? 'round8_clone';
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) throw new Error('ROUND8_CLONE_DB must be a plain lowercase database name');
  return value;
}
// "Local API only": an http origin on 127.0.0.1; parsed so userinfo cannot smuggle another host.
export function round8LocalApiUrl(value) {
  let url;
  try { url = new URL(value ?? ''); } catch { url = undefined; }
  return url?.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port !== '' && !url.username && !url.password
    && url.pathname === '/' && !url.search && !url.hash;
}

export function assertLocalDocker(env, docker) {
  if (env.DOCKER_HOST) throw new Error('DOCKER_HOST must be unset: the owned container is on the local daemon');
  if (![undefined, '', 'default'].includes(env.DOCKER_CONTEXT)) throw new Error('DOCKER_CONTEXT must be unset or default');
  const endpoint = JSON.parse(docker('docker', ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']));
  if (typeof endpoint !== 'string' || !endpoint.startsWith('unix://')) {
    throw new Error('the active docker context must be a local unix socket');
  }
}

export function assertOwnedContainer(inspect, owner, ticket) {
  const c = inspect?.[0];
  const h = c?.HostConfig;
  const tmpfs = target => c?.Mounts?.some(m => m.Type === 'tmpfs' && m.Destination === target)
    || Object.hasOwn(h?.Tmpfs ?? {}, target);
  const pgdata = c?.Config?.Env?.find(value => value.startsWith('PGDATA='))?.slice(7);
  if (!owner || !ticket || c?.Config?.Labels?.['sidequest.ticket'] !== ticket
    || c?.Config?.Labels?.['sidequest.owner'] !== owner
    || c?.Image !== 'sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426'
    || !Array.isArray(c?.Mounts) || c.Mounts.some(m => m.Type !== 'tmpfs')
    || !Array.isArray(h?.Mounts ?? []) || (h?.Mounts ?? []).some(m => m.Type !== 'tmpfs')
    || (h?.Binds ?? []).length || (h?.VolumesFrom ?? []).length
    || !pgdata || !tmpfs(pgdata) || !tmpfs('/var/run/postgresql')
    || /^(host|container:)/.test(h?.IpcMode ?? '') || /^(host|container:)/.test(h?.PidMode ?? '')) {
    throw new Error('isolated owned postgres container required');
  }
  const securityOpt = c?.HostConfig?.SecurityOpt ?? [];
  const parsedSecurityOpt = Array.isArray(securityOpt)
    ? securityOpt.map(option => {
      const separator = option.search(/[:=]/);
      return separator < 0 ? [option, undefined] : [option.slice(0, separator), option.slice(separator + 1)];
    }) : [];
  const noNewPrivileges = parsedSecurityOpt.filter(([key]) => key === 'no-new-privileges');
  if (inspect?.length !== 1 || c?.HostConfig?.NetworkMode !== 'none'
    || Object.keys(c.HostConfig.PortBindings ?? {}).length !== 0
    || Object.keys(c.NetworkSettings?.Ports ?? {}).length !== 0
    || !Array.isArray(securityOpt)
    || noNewPrivileges.length === 0 || noNewPrivileges.some(([, value]) => value !== 'true')
    || parsedSecurityOpt.some(([key, value]) =>
      (['seccomp', 'apparmor'].includes(key) && value === 'unconfined') || (key === 'label' && value === 'disable'))
    || c.HostConfig.Privileged !== false
    || (c.HostConfig.CapAdd !== null && c.HostConfig.CapAdd !== undefined
      && (!Array.isArray(c.HostConfig.CapAdd) || c.HostConfig.CapAdd.length !== 0))
    || c.HostConfig.ReadonlyRootfs !== true || typeof c.Name !== 'string'
    || c.Name.replace(/^\//, '').startsWith('supabase_')
    || c.Config?.Image !== 'public.ecr.aws/supabase/postgres:17.6.1.063') {
    throw new Error('isolated owned postgres container required');
  }
}

function assertInput(input) {
  if (!input || path.posix.isAbsolute(input) || path.win32.isAbsolute(input)
    || input.includes('..') || input.includes('\\') || !input.startsWith('supabase/')
    || path.posix.normalize(input) !== input) throw new Error('repo-relative supabase input required');
}

export function verifySqlInputs(input, control, readCommitted, readContainer) {
  assertInput(input);
  const checked = new Set();
  const visit = file => {
    if (checked.has(file)) return;
    const committed = readCommitted(file);
    if (hash(committed) !== hash(readContainer(inputRoot + file))) throw new Error('owned SQL input mismatch: ' + file);
    checked.add(file);
    const sql = committed.toString('utf8');
    for (const match of sql.matchAll(/\\(?:include_relative|include|ir|i)(?=[^A-Za-z_]|$)[^\r\n]*/g)) {
      const lineStart = sql.lastIndexOf('\n', match.index - 1) + 1;
      const include = /^\\(ir|i)[ \t]+([^\r\n]+)$/.exec(match[0]);
      if (!/^[ \t]*$/.test(sql.slice(lineStart, match.index)) || !include) {
        throw new Error('unsupported SQL include: ' + file);
      }
      const target = include[2].trim();
      if (target === ':external_reading_control' && include[1] === 'i') {
        if (control) visit(control.slice(inputRoot.length));
      } else {
        if (include[1] !== 'ir' || /[\s:'"\\]/.test(target) || path.posix.isAbsolute(target)) {
          throw new Error('unsupported SQL include: ' + file);
        }
        const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
        assertInput(relative);
        visit(relative);
      }
    }
  };
  visit(input);
  return [...checked];
}

export function controlSql(file, readCommitted) {
  if (file === 'control/old-reader.sql') {
    const old = readCommitted('supabase/migrations/00875_round8_external_fulfilment.sql').toString('utf8')
      .match(/CREATE OR REPLACE FUNCTION public\.get_project_external_fulfilments\(p_project_id uuid\)[\s\S]*?END \$\$;/)?.[0];
    if (!old) throw new Error('native old reader missing');
    return Buffer.from(old);
  }
  const reader = readCommitted('supabase/migrations/00884_round8_external_package_reading.sql').toString('utf8');
  const needle = file.startsWith('control/') && coverageControls[file.slice('control/'.length)];
  if (needle) {
    if (reader.split(needle).length !== 2) throw new Error('native reader control conjunct missing or ambiguous');
    return Buffer.from(reader.replace(needle, ''));
  }
  const start = file === 'control/deleted-bindings.sql'
    ? '   SELECT 1 FROM bindings b JOIN fulfilments f ON f.id=b.fulfilment_id'
    : file === 'control/deleted-receipts.sql' ? '   SELECT 1 FROM receipts v LEFT JOIN events e ON e.id=v.event_id' : undefined;
  if (!start) throw new Error('unsupported reader control');
  const from = reader.indexOf(start);
  const to = reader.indexOf('  ) AND NOT EXISTS(', from);
  if (from < 0 || to < 0) throw new Error('native reader control block missing');
  return Buffer.from(reader.slice(0, from) + '   SELECT 1 WHERE false\n' + reader.slice(to));
}

export function main(env = process.env, argv = process.argv, run = spawnSync) {
  const id = env.ROUND8_OWNED_CONTAINER;
  const input = argv[2];
  const control = env.ROUND8_EXTERNAL_READING_CONTROL;
  if (env.ROUND8_PSQL_TRANSPORT !== 'docker-exec' || !/^[0-9a-f]{64}$/.test(id ?? '')) {
    throw new Error('owned docker-exec transport required');
  }
  const cloneDb = round8CloneDb(env);
  assertInput(input);
  if (argv.length !== 3) throw new Error('one SQL input required');
  if (control !== undefined && (env.ROUND8_NEGATIVE_CONTROL !== '1'
    || !controls.some(name => control === inputRoot + 'control/' + name))) {
    throw new Error('explicit negative-control mode and owned input control path required');
  }
  const root = realpathSync(process.cwd());
  const checkedRun = (binary, args, options = {}) => {
    const result = run(binary, args, { timeout: 10000, maxBuffer: 16 * 1024 * 1024, ...options });
    if (result.error || result.status !== 0) throw new Error('owned input command failed: ' + binary + ' ' + args[0]);
    return result.stdout;
  };
  assertOwnedContainer(JSON.parse(checkedRun('docker', ['inspect', '--type', 'container', id]).toString()), env.ROUND8_OWNED_OWNER, env.ROUND8_OWNED_TICKET);
  const commit = checkedRun('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('committed candidate required');
  const bytes = new Map();
  const readCommitted = file => {
    if (!bytes.has(file)) bytes.set(file, file.startsWith('control/') ? controlSql(file, readCommitted)
      : checkedRun('git', ['show', commit + ':' + file], { cwd: root }));
    return bytes.get(file);
  };
  const files = verifySqlInputs(input, control, readCommitted,
    file => checkedRun('docker', ['exec', id, 'cat', file]));
  // Execute a fresh snapshot of the verified committed bytes, never the mutable input tree.
  const snapshot = '/tmp/round8-verified-' + randomUUID() + '/';
  checkedRun('docker', ['exec', id, 'mkdir', '-m', '0755', snapshot]);
  for (const file of files) {
    const destination = snapshot + file;
    checkedRun('docker', ['exec', id, 'mkdir', '-p', path.posix.dirname(destination)]);
    checkedRun('docker', ['exec', '-i', id, 'install', '-m', '0444', '/dev/stdin', destination], { input: bytes.get(file) });
    if (hash(checkedRun('docker', ['exec', id, 'cat', destination])) !== hash(bytes.get(file))) {
      throw new Error('owned SQL snapshot mismatch: ' + file);
    }
  }
  checkedRun('docker', ['exec', id, 'chmod', '-R', 'a-w', snapshot]);
  const args = ['exec', '-i', '-u', 'postgres', '-e', 'PGPASSFILE=/tmp/round8-owned.pgpass',
    id, 'psql', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', cloneDb,
    '-w', '-X', '-v', 'ON_ERROR_STOP=1'];
  if (control !== undefined) args.push('-v', 'external_reading_control=' + snapshot + control.slice(inputRoot.length));
  args.push('-f', snapshot + input);
  const result = run('docker', args, { stdio: 'inherit', timeout: 180000 });
  if (result.error?.code === 'ETIMEDOUT') {
    // Killing the local docker client does not terminate its in-container psql.
    const stop = run('docker', ['stop', '-t', '5', id], { stdio: 'inherit', timeout: 15000 });
    console.error(stop.status === 0
      ? 'SQL timeout; dedicated owned runtime stop returned zero; confirm teardown'
      : 'SQL timeout; owned runtime cleanup UNCONFIRMED');
  }
  if (result.error) console.error('owned psql transport failed: ' + result.error.code);
  return result.error ? 1 : (result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
