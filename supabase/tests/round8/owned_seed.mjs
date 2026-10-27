// Provision and seed the owned round-8 container without replaying migrations (SQ-2177 proved the
// bare image cannot: auth.jwt() is missing at 00025:91). The source is a fully reset ISOLATED CLI
// stack; the shared `supabase` project is refused. See README.md for the full procedure.
//   create: ROUND8_OWNED_OWNER, ROUND8_OWNED_TICKET [ROUND8_CLONE_DB] -> prints the container id
//   seed:   ROUND8_SEED_SOURCE_PROJECT, ROUND8_OWNED_CONTAINER, ROUND8_OWNED_OWNER, ROUND8_OWNED_TICKET
//           [ROUND8_CLONE_DB]; dumps go to a fresh os.tmpdir() directory and are deleted after restore.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync,
  writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { assertOwnedContainer, round8CloneDb } from './owned_psql.mjs';

export const image = { tag: 'public.ecr.aws/supabase/postgres:17.6.1.063',
  id: 'sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426' };
const pgpass = '/tmp/round8-owned.pgpass';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function sourceProject(env) {
  const project = env.ROUND8_SEED_SOURCE_PROJECT ?? '';
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(project) || project === 'supabase') {
    throw new Error('ROUND8_SEED_SOURCE_PROJECT must name an isolated CLI project, never the shared supabase stack');
  }
  return project;
}

// The source is that project's running CLI database on the same pinned image as the owned target.
export function assertSourceStack(inspect, project) {
  const c = inspect?.length === 1 ? inspect[0] : undefined;
  if (c?.Name !== '/supabase_db_' + project || c?.Config?.Labels?.['com.supabase.cli.project'] !== project
    || c?.Config?.Image !== image.tag || c?.Image !== image.id || c?.State?.Running !== true) {
    throw new Error('isolated CLI source stack required: supabase_db_' + project);
  }
}

// The image bootstrap already creates the Supabase roles; every other roles-dump statement is idempotent.
export function idempotentRoles(sql) {
  let created = 0;
  const out = sql.replace(/^CREATE ROLE ([a-z_][a-z0-9_]*);$/gm, (line, role) => {
    created += 1;
    return `DO $role$ BEGIN CREATE ROLE ${role}; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;`;
  });
  if (/^CREATE ROLE /m.test(out) || created === 0) throw new Error('unsupported roles dump');
  return out;
}

export function assertOutsideRepo(dir, repoRoot) {
  const relative = path.relative(realpathSync(repoRoot), realpathSync(dir));
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('dump directory must be outside the repository');
}

export function treeHashes(root) {
  const files = [];
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else files.push({ file: path.relative(root, file), sha256: hash(readFileSync(file)) });
    }
  };
  walk(root);
  return files;
}

// SQ-2177 shape: the tmpfs over /etc/postgresql-custom masks the image tree (supautils.conf, ...),
// so the never-started extraction is restored byte-identically before postgres starts.
export function startCommand(nativeTarGzBase64, cloneDb) {
  return 'set -e; cp -a /etc/postgresql/. /etc/postgresql-custom/; printf %s ' + nativeTarGzBase64
    + ' | base64 -d | tar -xzf - --strip-components=1 -C /etc/postgresql-custom;'
    + ' exec docker-entrypoint.sh postgres -D /etc/postgresql-custom -c data_directory=/var/lib/postgresql/data'
    + ' -c hba_file=/etc/postgresql-custom/pg_hba.conf -c ident_file=/etc/postgresql-custom/pg_ident.conf'
    + ' -c cron.launch_active_jobs=off -c cron.database_name=' + cloneDb + ' -c logging_collector=off';
}

const checked = run => (binary, args, options = {}) => {
  const result = run(binary, args, { timeout: 30000, maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`owned seed command failed: ${binary} ${args.slice(0, 2).join(' ')}: ${String(result.stderr ?? result.error).slice(-2000)}`);
  }
  return options.returnStderr ? result : result.stdout;
};
const owned = env => {
  if (!env.ROUND8_OWNED_OWNER || !/^SQ-[1-9][0-9]*$/.test(env.ROUND8_OWNED_TICKET ?? '')) {
    throw new Error('ROUND8_OWNED_OWNER and ROUND8_OWNED_TICKET are required');
  }
  return { owner: env.ROUND8_OWNED_OWNER, ticket: env.ROUND8_OWNED_TICKET };
};

function extractNativeTree(docker, labels, work) {
  const id = docker('docker', ['create', '--network', 'none', ...labels, image.id]).toString().trim();
  try {
    if (JSON.parse(docker('docker', ['inspect', id]))[0].State.Status !== 'created') throw new Error('extraction source must never start');
    writeFileSync(path.join(work, 'native.tar'), docker('docker', ['cp', id + ':/etc/postgresql-custom', '-']));
  } finally { docker('docker', ['rm', id]); }
  docker('mkdir', [path.join(work, 'tree')]);
  docker('tar', ['-xf', path.join(work, 'native.tar'), '-C', path.join(work, 'tree')]);
  const files = treeHashes(path.join(work, 'tree', 'postgresql-custom'));
  return { tar: readFileSync(path.join(work, 'native.tar')), files };
}

export function create(env = process.env, run = spawnSync, wait = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)) {
  const { owner, ticket } = owned(env);
  const cloneDb = round8CloneDb(env);
  const docker = checked(run);
  const labels = ['--label', 'sidequest.ticket=' + ticket, '--label', 'sidequest.owner=' + owner];
  const work = mkdtempSync(path.join(tmpdir(), 'round8-native-'));
  try {
    const native = extractNativeTree(docker, labels, work);
    const id = docker('docker', ['create', '--network', 'none', '--read-only',
      '--tmpfs', '/var/run/postgresql:rw,nosuid,nodev,size=16m', '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,nodev,size=1536m',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m', '--tmpfs', '/etc/postgresql-custom:rw,nosuid,nodev,size=16m',
      '--memory', '2g', '--memory-swap', '2g', '--cpus', '2', '--pids-limit', '256',
      '--security-opt', 'no-new-privileges:true', '--ipc', 'private', ...labels,
      '-e', 'POSTGRES_PASSWORD=' + randomUUID(), '-e', 'PGDATA=/var/lib/postgresql/data',
      '--entrypoint', '/bin/bash', image.tag, '-lc', startCommand(gzipSync(native.tar, { level: 9 }).toString('base64'), cloneDb),
    ]).toString().trim();
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('invalid container id');
    assertOwnedContainer(JSON.parse(docker('docker', ['inspect', '--type', 'container', id])), owner, ticket);
    docker('docker', ['start', id]);
    for (let tries = 0; ; tries += 1) {
      const logs = run('docker', ['logs', id], { encoding: 'utf8', timeout: 10000 });
      const ready = /init process complete/.test(logs.stdout + logs.stderr)
        && run('docker', ['exec', '-u', 'postgres', id, 'pg_isready', '-q', '-h', '/var/run/postgresql'], { timeout: 10000 }).status === 0;
      if (ready) break;
      if (tries > 120) throw new Error('owned postgres did not become ready');
      wait(1000);
    }
    const restored = docker('docker', ['exec', id, 'sha256sum', ...native.files.map(f => '/etc/postgresql-custom/' + f.file)]).toString();
    for (const f of native.files) {
      if (!restored.includes(f.sha256 + '  /etc/postgresql-custom/' + f.file + '\n')) throw new Error('native config hash mismatch: ' + f.file);
    }
    const password = JSON.parse(docker('docker', ['inspect', id]))[0].Config.Env.find(e => e.startsWith('POSTGRES_PASSWORD=')).slice(18);
    docker('docker', ['exec', '-i', '-u', 'postgres', id, 'install', '-m', '0600', '/dev/stdin', pgpass],
      { input: `*:*:*:supabase_admin:${password}\n` });
    return { container: id, cloneDb, nativeTarSha256: hash(native.tar), nativeFiles: native.files };
  } finally { rmSync(work, { recursive: true, force: true }); }
}

// pg_dump emits event triggers last, so CREATE EXTENSION pg_graphql cannot fire the native trigger that
// creates graphql_public.graphql; only the ACL statements on that trigger-made function may fail.
export const tolerated = [/^function graphql_public\.graphql\(text, text, jsonb, jsonb\) does not exist$/];
export function untoleratedErrors(stderr) {
  const errors = [...String(stderr).matchAll(/^psql:<stdin>:\d+: ERROR:  (.*)$/gm)].map(match => match[1]);
  return { errors, untolerated: errors.filter(error => !tolerated.some(pattern => pattern.test(error))) };
}
// One plain-SQL stream into the owned container over docker exec stdin; no copy, no network.
function restore(docker, id, db, file, { tolerate = false } = {}) {
  const fd = openSync(file, 'r');
  try {
    const result = docker('docker', ['exec', '-i', '-u', 'postgres', '-e', 'PGPASSFILE=' + pgpass, id, 'psql', '-h', '/var/run/postgresql',
      '-U', 'supabase_admin', '-d', db, '-X', '-w', '-q', '-v', 'ON_ERROR_STOP=' + (tolerate ? 0 : 1), '-f', '-'],
    { stdio: [fd, 'pipe', 'pipe'], timeout: 900000, returnStderr: true });
    if (!tolerate) return [];
    const { errors, untolerated } = untoleratedErrors(result.stderr);
    if (untolerated.length) throw new Error('restore errors outside the tolerated list:\n' + untolerated.join('\n'));
    return errors;
  } finally { closeSync(fd); }
}

function dumpTo(run, file, args) {
  const fd = openSync(file, 'wx', 0o600);
  try {
    const result = run('docker', args, { stdio: ['ignore', fd, 'pipe'], timeout: 600000 });
    if (result.error || result.status !== 0) throw new Error('dump failed: ' + args[3] + ': ' + String(result.stderr ?? result.error).slice(-2000));
  } finally { closeSync(fd); }
  return { bytes: statSync(file).size, sha256: hash(readFileSync(file)) };
}

const settingsSql = cloneDb => `SELECT format('ALTER %s SET %s TO %L;',
  CASE WHEN s.setrole=0 THEN format('DATABASE %I',${"'" + cloneDb + "'"}) ELSE format('ROLE %I IN DATABASE %I',r.rolname,${"'" + cloneDb + "'"}) END,
  split_part(c,'=',1),substr(c,strpos(c,'=')+1))
  FROM pg_db_role_setting s CROSS JOIN unnest(s.setconfig) c LEFT JOIN pg_roles r ON r.oid=s.setrole
  WHERE s.setdatabase=(SELECT oid FROM pg_database WHERE datname='postgres') ORDER BY 1;`;

const probe = `SELECT json_build_object('publicRelations',(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace),
  'publicFunctions',(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace),
  'migrations',(SELECT count(*) FROM supabase_migrations.schema_migrations),
  'authJwt',to_regprocedure('auth.jwt()') IS NOT NULL,
  'extensions',(SELECT string_agg(extname,',' ORDER BY extname) FROM pg_extension))`;

export function seed(env = process.env, run = spawnSync, repoRoot = process.cwd()) {
  const project = sourceProject(env);
  const id = env.ROUND8_OWNED_CONTAINER ?? '';
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('ROUND8_OWNED_CONTAINER must be an exact 64-hex container id');
  const { owner, ticket } = owned(env);
  const cloneDb = round8CloneDb(env);
  const docker = checked(run);
  const source = 'supabase_db_' + project;
  assertSourceStack(JSON.parse(docker('docker', ['inspect', '--type', 'container', source])), project);
  const target = JSON.parse(docker('docker', ['inspect', '--type', 'container', id]));
  assertOwnedContainer(target, owner, ticket);
  if (target[0].State?.Running !== true) throw new Error('owned container must be running');
  const admin = (db, sql) => docker('docker', ['exec', '-u', 'postgres', '-e', 'PGPASSFILE=' + pgpass, id, 'psql', '-h', '/var/run/postgresql',
    '-U', 'supabase_admin', '-d', db, '-X', '-w', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]).toString().trim();
  if (admin('postgres', `SELECT count(*) FROM pg_database WHERE datname='${cloneDb}'`) !== '0') throw new Error('clone database already exists');
  const sourceSql = sql => docker('docker', ['exec', source, 'psql', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres',
    '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]).toString();
  const work = mkdtempSync(path.join(tmpdir(), 'round8-seed-'));
  const report = { source, container: id, cloneDb, workDir: work };
  try {
    assertOutsideRepo(work, repoRoot);
    const file = name => path.join(work, name);
    report.roles = dumpTo(run, file('roles.sql'), ['exec', source, 'pg_dumpall', '--roles-only', '--no-role-passwords', '-h', '127.0.0.1', '-U', 'supabase_admin']);
    report.database = dumpTo(run, file('database.sql'), ['exec', source, 'pg_dump', '--no-password', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres']);
    writeFileSync(file('roles.restore.sql'), idempotentRoles(readFileSync(file('roles.sql'), 'utf8')), { mode: 0o600 });
    writeFileSync(file('create.sql'), `CREATE DATABASE ${cloneDb} TEMPLATE template0;\n${sourceSql(settingsSql(cloneDb))}`, { mode: 0o600 });
    restore(docker, id, 'postgres', file('roles.restore.sql'));
    restore(docker, id, 'postgres', file('create.sql'));
    report.toleratedRestoreErrors = restore(docker, id, cloneDb, file('database.sql'), { tolerate: true });
    report.sourceProbe = JSON.parse(sourceSql(probe));
    report.cloneProbe = JSON.parse(admin(cloneDb, probe));
    if (JSON.stringify(report.sourceProbe) !== JSON.stringify(report.cloneProbe)) throw new Error('clone probe differs from source');
  } finally {
    rmSync(work, { recursive: true, force: true });
    report.dumpsDeleted = !existsSync(work);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (!['create', 'seed'].includes(mode) || process.argv.length !== 3) throw new Error('usage: owned_seed.mjs create|seed');
  console.log(JSON.stringify(mode === 'create' ? create() : seed(), null, 2));
}
