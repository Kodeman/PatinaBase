import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const inputRoot = '/tmp/round8-input/';

export function assertOwnedContainer(inspect) {
  const c = inspect?.[0];
  if (inspect?.length !== 1 || c?.HostConfig?.NetworkMode !== 'none'
    || Object.keys(c.HostConfig.PortBindings ?? {}).length !== 0
    || Object.keys(c.NetworkSettings?.Ports ?? {}).length !== 0
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

export function verifySqlInputs(input, control, readLocal, readContainer) {
  assertInput(input);
  const checked = new Set();
  const visit = (file) => {
    if (checked.has(file)) return;
    const local = readLocal(file);
    const remote = readContainer(inputRoot + file);
    const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
    if (hash(local) !== hash(remote)) throw new Error('owned SQL input mismatch: ' + file);
    checked.add(file);
    for (const match of local.toString('utf8').matchAll(/^\s*\\(ir|i)\s+([^\r\n]+)$/gm)) {
      const target = match[2].trim();
      if (target === ':external_reading_control') {
        if (control) visit(control.slice(inputRoot.length));
      } else {
        if (match[1] !== 'ir' || /[\s:'"\\]/.test(target) || path.posix.isAbsolute(target)) {
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

export function main(env = process.env, argv = process.argv, run = spawnSync) {
  const id = env.ROUND8_OWNED_CONTAINER;
  const input = argv[2];
  const control = env.ROUND8_EXTERNAL_READING_CONTROL;
  if (env.ROUND8_PSQL_TRANSPORT !== 'docker-exec' || !/^[0-9a-f]{64}$/.test(id ?? '')) {
    throw new Error('owned docker-exec transport required');
  }
  assertInput(input);
  if (argv.length !== 3) throw new Error('one SQL input required');
  if (control !== undefined && (env.ROUND8_NEGATIVE_CONTROL !== '1'
    || control !== inputRoot + 'control/old-reader.sql')) {
    throw new Error('explicit negative-control mode and owned input control path required');
  }
  const inspect = run('docker', ['inspect', id], { encoding: 'utf8', timeout: 10000 });
  if (inspect.error || inspect.status !== 0) throw new Error('owned container inspection failed');
  assertOwnedContainer(JSON.parse(inspect.stdout));
  const root = realpathSync(process.cwd());
  verifySqlInputs(input, control, (file) => {
    if (file === 'control/old-reader.sql') {
      const old = readFileSync(path.join(root, 'supabase/migrations/00875_round8_external_fulfilment.sql'), 'utf8')
        .match(/CREATE OR REPLACE FUNCTION public\.get_project_external_fulfilments\(p_project_id uuid\)[\s\S]*?END \$\$;/)?.[0];
      if (!old) throw new Error('native old reader missing');
      return Buffer.from(old);
    }
    const full = path.resolve(root, file);
    if (!lstatSync(full).isFile() || realpathSync(full) !== full) throw new Error('regular SQL input required: ' + file);
    return readFileSync(full);
  }, (file) => {
    const result = run('docker', ['exec', id, 'cat', file], { timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error('owned SQL input missing: ' + file);
    return result.stdout;
  });
  const args = ['exec', '-i', '-u', 'postgres', '-e', 'PGPASSFILE=/tmp/round8-owned.pgpass',
    id, 'psql', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'round8_clone',
    '-w', '-X', '-v', 'ON_ERROR_STOP=1'];
  if (control !== undefined) args.push('-v', 'external_reading_control=' + control);
  args.push('-f', inputRoot + input);
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
