#!/usr/bin/env node
/**
 * RC-2 consumer journey runner (SQ-2337). The only supported way to run the
 * five-leg designer/client journey (A20–A23, X08):
 *
 *   node apps/designer-portal/e2e/round8/run-consumer-journey.mjs --evidence <dir> [--runs 2]
 *       [--workdir <existing scratch parent>] [--pins-from <dir with the .temp version pins>] [--keep-stack]
 *   node apps/designer-portal/e2e/round8/run-consumer-journey.mjs --refusal-check <db url> --evidence <dir>
 *
 * Journey mode starts ONE owned Supabase stack (project patina-rc2-journey,
 * ports +3000: API 57321, DB 57322) from this checkout's supabase/ in a scratch
 * workdir that holds only the five .temp version pins, with edge-runtime and a
 * functions env of exactly EMAIL_DEV_MODE=dry_run. It proves the stack from
 * Docker (CLI project label, published ports, container address and cluster
 * system identifier), writes a sanitized receipt (no keys), then runs the legs
 * in order for each journey: designer @rc2-send, client @rc2-return, designer
 * @rc2-resend, client @rc2-accept, designer @rc2-complete. Each journey's send
 * leg applies the fixture once (a fresh job); legs never tear anything down.
 * At the end it stops the owned stack with --no-backup (unless --keep-stack),
 * checks the full teardown census (containers and volumes, including removal of
 * child-only resources), and removes the scratch workdir.
 *
 * Refusal-check mode applies consumer-journey-fixture.sql to <db url> without
 * owned identity and with identity self-derived from that URL (the SQ-2334 F1
 * failure). Each must exit non-zero, read-only markers the fixture would
 * change must be unchanged, and the designer journey config must refuse to
 * load. It never writes.
 *
 * Never point it at Strata; it refuses anything but loopback, and refuses the
 * shared stack (54321/54322).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGNER = path.resolve(HERE, '../..');
const ROOT = path.resolve(DESIGNER, '../..');
const CLIENT_APP = path.join(ROOT, 'apps/client-portal');
const FIXTURE = path.join(HERE, 'consumer-journey-fixture.sql');
const CONFIG = 'playwright.consumer-journey.config.ts';
const PROJECT = 'patina-rc2-journey';
const OFFSET = 3000;
const SHARED = { api: '54321', db: '54322' };
const OWNED = { api: String(54321 + OFFSET), db: String(54322 + OFFSET) };
const PINS = ['gotrue-version', 'postgres-version', 'rest-version', 'storage-migration', 'storage-version'];
const EXCLUDED_SERVICES = 'studio,mailpit,logflare,vector,imgproxy,postgres-meta';
const LEGS = [['designer', '@rc2-send'], ['client', '@rc2-return'], ['designer', '@rc2-resend'],
  ['client', '@rc2-accept'], ['designer', '@rc2-complete']];
const MIN_FREE_KIB = 9 * 1024 * 1024;
const PROVIDER_KEY = /RESEND|SMTP|SENDGRID|POSTMARK|MAILGUN|SES_|TWILIO/i;

function parseArgs(argv) {
  const args = { runs: 2, keepStack: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      i += 1;
      return next;
    };
    if (flag === '--evidence') args.evidence = path.resolve(value());
    else if (flag === '--runs') args.runs = Number(value());
    else if (flag === '--workdir') args.workdir = path.resolve(value());
    else if (flag === '--pins-from') args.pinsFrom = path.resolve(value());
    else if (flag === '--refusal-check') args.refusalCheck = value();
    else if (flag === '--keep-stack') args.keepStack = true;
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!args.evidence) throw new Error('--evidence <dir> is required');
  if (!Number.isInteger(args.runs) || args.runs < 1) throw new Error('--runs must be a positive integer');
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}

function must(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function log(evidence, line) {
  console.log(line);
  fs.appendFileSync(path.join(evidence, 'journey.txt'), `${line}\n`);
}

function freeKiB() {
  const line = must('df', ['-k', os.homedir()]).split('\n').pop();
  return Number(line.trim().split(/\s+/)[3]);
}

function requireDisk(evidence) {
  const free = freeKiB();
  if (free < MIN_FREE_KIB) throw new Error(`free disk ${(free / 1048576).toFixed(2)} GiB is below 9 GiB; stopping`);
  log(evidence, `disk: ${(free / 1048576).toFixed(2)} GiB free`);
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(port) });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

function containers(filterLabel) {
  return must('docker', ['ps', '-a', '--filter', `label=${filterLabel}`, '--format', '{{.Names}}'])
    .split('\n').filter(Boolean);
}

function inspect(name) {
  return JSON.parse(must('docker', ['inspect', name]))[0];
}

/** The main checkout's supabase/.temp (version pins only are copied from it). */
function defaultPins() {
  const common = must('git', ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir']);
  return path.join(path.dirname(common), 'supabase', '.temp');
}

function prepareWorkdir(workdir, pinsFrom) {
  const source = path.join(ROOT, 'supabase');
  const target = path.join(workdir, 'supabase');
  fs.cpSync(source, target, {
    recursive: true,
    filter: (entry) => {
      const rel = path.relative(source, entry).split(path.sep).join('/');
      return !/^(\.temp|\.branches|\.env[^/]*)(\/|$)/.test(rel) && !/^functions\/\.env/.test(rel);
    },
  });
  fs.mkdirSync(path.join(target, '.temp'));
  for (const pin of PINS) fs.copyFileSync(path.join(pinsFrom, pin), path.join(target, '.temp', pin));
  const configPath = path.join(target, 'config.toml');
  const config = fs.readFileSync(configPath, 'utf8')
    .replace(/^project_id = "supabase"$/m, `project_id = "${PROJECT}"`)
    .replace(/^(\s*(?:port|shadow_port) = )(543\d\d)$/gm, (_, key, port) => `${key}${Number(port) + OFFSET}`)
    .replace(/^(\s*inspector_port = )(\d+)$/m, (_, key, port) => `${key}${Number(port) + OFFSET}`);
  if (!config.includes(`project_id = "${PROJECT}"`) || !config.includes(`port = ${OWNED.db}`)
    || !config.includes(`port = ${OWNED.api}`)) {
    throw new Error('could not rewrite config.toml to the owned project and ports');
  }
  fs.writeFileSync(configPath, config);
  // The functions env: dry-run email only, never a provider key.
  fs.writeFileSync(path.join(target, 'functions', '.env'), 'EMAIL_DEV_MODE=dry_run\n');
}

function stackEnv(workdir) {
  const env = {};
  for (const line of must('supabase', ['status', '--workdir', workdir, '-o', 'env']).split('\n')) {
    const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) env[match[1]] = match[2];
  }
  for (const key of ['API_URL', 'DB_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
    if (!env[key]) throw new Error(`supabase status did not report ${key}`);
  }
  return env;
}

function psql(dbUrl, query) {
  return must('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', dbUrl, '-c', query]);
}

/** Refuses a non-loopback or shared-stack URL (shared by both modes). */
function refuseShared(name, url, owned) {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error(`${name} ${url.host} is not loopback`);
  if (Object.values(SHARED).includes(url.port)) throw new Error(`${name} port ${url.port} is the shared Supabase stack`);
  if (url.port !== owned) throw new Error(`${name} port ${url.port} is not the owned port ${owned}`);
}

/** A container's cluster system identifier, read inside that container (its own loopback). */
function clusterId(container) {
  return must('docker', ['exec', '-e', 'PGPASSWORD=postgres', container, 'psql', '-h', '127.0.0.1', '-U', 'postgres',
    '-d', 'postgres', '-t', '-A', '-c', 'SELECT system_identifier FROM pg_control_system();']);
}

/**
 * The owned identity, read from Docker: the containers the CLI labelled with
 * the owned project, their published ports, the database container's address
 * and its cluster system identifier (read inside the container, not through
 * the URL). The URL is then checked against it.
 */
function proveOwned(env) {
  const db = new URL(env.DB_URL);
  const api = new URL(env.API_URL);
  refuseShared('database', db, OWNED.db);
  refuseShared('API', api, OWNED.api);
  const dbName = `supabase_db_${PROJECT}`;
  const dbBox = inspect(dbName);
  const kong = inspect(`supabase_kong_${PROJECT}`);
  for (const box of [dbBox, kong]) {
    if (box.Config.Labels['com.supabase.cli.project'] !== PROJECT) throw new Error(`${box.Name} is not labelled ${PROJECT}`);
  }
  const dbPort = dbBox.NetworkSettings.Ports['5432/tcp']?.[0]?.HostPort;
  const apiPort = kong.NetworkSettings.Ports['8000/tcp']?.[0]?.HostPort;
  if (dbPort !== db.port || apiPort !== api.port) {
    throw new Error(`owned containers publish db ${dbPort}/api ${apiPort}, not ${db.port}/${api.port}`);
  }
  const serverAddr = dbBox.NetworkSettings.Networks[`supabase_network_${PROJECT}`]?.IPAddress;
  if (!serverAddr) throw new Error(`${dbName} has no address on supabase_network_${PROJECT}`);
  const systemId = clusterId(dbName);
  const [urlSystemId, urlAddr] = psql(env.DB_URL,
    'SELECT system_identifier || \'|\' || host(inet_server_addr()) FROM pg_control_system();').split('|');
  if (urlSystemId !== systemId || urlAddr !== serverAddr) {
    throw new Error('the database URL does not reach the owned container');
  }
  let sharedSystemId = null;
  if (containers('com.supabase.cli.project=supabase').includes('supabase_db_supabase')) {
    sharedSystemId = clusterId('supabase_db_supabase');
    if (sharedSystemId === systemId) throw new Error('the owned cluster shares the shared stack\'s system identifier');
  }
  return { dbPort, apiPort, serverAddr, systemId, sharedSystemId, dbContainer: dbBox.Id.slice(0, 12) };
}

/** The functions environment as the edge runtime sees it: names only, plus the dry-run mode. */
function functionsReceipt() {
  const edge = `supabase_edge_runtime_${PROJECT}`;
  const names = must('docker', ['exec', edge, 'sh', '-c', 'env | cut -d= -f1 | sort']).split('\n').filter(Boolean);
  const mode = must('docker', ['exec', edge, 'printenv', 'EMAIL_DEV_MODE']);
  const providerKeyNames = names.filter((name) => PROVIDER_KEY.test(name));
  if (mode !== 'dry_run' || providerKeyNames.length > 0) {
    throw new Error(`edge runtime is not dry-run only (EMAIL_DEV_MODE=${mode}; provider keys ${providerKeyNames.join(',')})`);
  }
  return { container: edge, EMAIL_DEV_MODE: mode, providerKeyNames, envNameCount: names.length };
}

function runLeg(evidence, label, side, tag, legEnv) {
  const dir = path.join(evidence, label);
  fs.mkdirSync(dir, { recursive: true });
  const report = path.join(dir, `${side}-${tag}`);
  const logPath = path.join(dir, `${side}-${tag}.log`);
  const out = fs.openSync(logPath, 'w');
  const result = spawnSync('pnpm', ['exec', 'playwright', 'test', '--config', CONFIG, '--grep', tag], {
    cwd: side === 'designer' ? DESIGNER : CLIENT_APP,
    env: { ...legEnv, PLAYWRIGHT_OUTPUT_DIR: report, PLAYWRIGHT_EVIDENCE_DIR: report },
    stdio: ['ignore', out, out],
    timeout: 20 * 60 * 1000,
    killSignal: 'SIGTERM',
  });
  fs.closeSync(out);
  const text = fs.readFileSync(logPath, 'utf8');
  // Judge only Playwright's own result lines: the dev server's log carries
  // unrelated text such as "[help-system] Sanity fetch failed".
  const lines = text.split('\n').filter((line) => !line.includes('[WebServer]') && /✓|✘|^\s*\d+ \w/.test(line));
  const summary = lines.filter((line) => /^\s*\d+ (passed|failed|flaky|skipped|did not run|interrupted)\b/.test(line))
    .map((line) => line.trim().replace(/ \(.*\)$/, ''));
  return { ok: result.status === 0 && summary.length === 1 && summary[0] === '1 passed',
    status: result.status ?? result.signal, logPath, lines };
}

function createOwnedWorkdir(parent = os.tmpdir()) {
  const target = fs.realpathSync(parent);
  if (target === path.parse(target).root || target === fs.realpathSync(os.homedir())
    || target === fs.realpathSync(ROOT) || fs.existsSync(path.join(target, '.git'))) {
    throw new Error(`unsafe workdir parent ${target}; use an existing scratch directory outside checkout roots`);
  }
  return fs.mkdtempSync(path.join(target, 'patina-rc2-journey-'));
}

function cleanupWorkdir(workdir, started, keepStack, evidence) {
  if (keepStack) {
    log(evidence, `stack kept by request; recovery workdir: ${workdir}`);
    return true;
  }
  try {
    if (started) {
      const stop = run('supabase', ['stop', '--workdir', workdir, '--no-backup'], { timeout: 10 * 60 * 1000 });
      const left = containers(`com.supabase.cli.project=${PROJECT}`);
      const volumes = must('docker', ['volume', 'ls', '--filter', `label=com.supabase.cli.project=${PROJECT}`, '-q'])
        .split('\n').filter(Boolean);
      log(evidence, `teardown: supabase stop --no-backup exit=${stop.status}; containers left ${left.length}; volumes left ${volumes.length}`);
      if (stop.status !== 0 || left.length !== 0 || volumes.length !== 0) {
        throw new Error('owned stack teardown is incomplete');
      }
    }
    fs.rmSync(workdir, { recursive: true, force: true });
    return true;
  } catch (error) {
    log(evidence, `teardown FAILED: ${error.message}; recovery workdir: ${workdir}`);
    return false;
  }
}

async function journey(args) {
  const { evidence } = args;
  requireDisk(evidence);
  const existing = containers(`com.supabase.cli.project=${PROJECT}`);
  if (existing.length > 0) throw new Error(`containers of ${PROJECT} already exist (${existing.join(', ')}); not owned by this run`);
  for (const port of [OWNED.api, OWNED.db, '3200', '3202']) {
    if (await portInUse(port)) throw new Error(`port ${port} is already in use`);
  }
  const workdir = createOwnedWorkdir(args.workdir);
  let started = false;
  let cleaned = false;
  let passed = 0;
  try {
    prepareWorkdir(workdir, args.pinsFrom ?? defaultPins());
    log(evidence, `owned stack: ${PROJECT} workdir ${workdir}`);
    started = true;
    must('supabase', ['start', '--workdir', workdir, '-x', EXCLUDED_SERVICES], { timeout: 20 * 60 * 1000 });
    const env = stackEnv(workdir);
    const identity = proveOwned(env);
    const receipt = {
      at: new Date().toISOString(), project: PROJECT, workdir,
      cli: must('supabase', ['--version']).split('\n')[0], head: must('git', ['-C', ROOT, 'rev-parse', 'HEAD']),
      api: { url: env.API_URL, port: identity.apiPort }, db: { port: identity.dbPort, container: identity.dbContainer,
        serverAddr: identity.serverAddr, systemId: identity.systemId }, sharedSystemId: identity.sharedSystemId,
      functions: functionsReceipt(),
      ledgerMax: psql(env.DB_URL, 'SELECT max(version) FROM supabase_migrations.schema_migrations;'),
      scopeEditionsAtStart: psql(env.DB_URL, "SELECT enabled FROM public.server_capabilities WHERE key='scope_editions';"),
    };
    fs.writeFileSync(path.join(evidence, 'stack-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    log(evidence, `receipt: ${JSON.stringify({ ...receipt, workdir: undefined })}`);
    const legEnv = {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: env.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: env.ANON_KEY,
      SUPABASE_URL: env.API_URL, SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY, SUPABASE_DB_URL: env.DB_URL,
      RC2_OWNED_DB_PORT: identity.dbPort, RC2_OWNED_API_PORT: identity.apiPort,
      RC2_OWNED_SERVER_ADDR: identity.serverAddr, RC2_OWNED_SYSTEM_ID: identity.systemId,
    };
    for (let n = 1; n <= args.runs; n += 1) {
      const label = `run${n}`;
      let ok = true;
      for (const [side, tag] of LEGS) {
        requireDisk(evidence);
        const leg = runLeg(evidence, label, side, tag, legEnv);
        log(evidence, `== ${label} ${side} ${tag} exit=${leg.status} log=${leg.logPath}`);
        for (const line of leg.lines) log(evidence, `   ${line.trim()}`);
        if (!leg.ok) { ok = false; break; }
      }
      log(evidence, `JOURNEY ${label} ${ok ? 'PASSED' : 'FAILED'}`);
      if (!ok) break;
      passed += 1;
    }
  } finally {
    cleaned = cleanupWorkdir(workdir, started, args.keepStack, evidence);
  }
  return passed === args.runs && cleaned;
}

function refusalCheck(args) {
  const { evidence } = args;
  const target = new URL(args.refusalCheck);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new Error('refusal check reads loopback only');
  const markersSql = `SELECT json_build_object(
    'rc2Users', (SELECT count(*) FROM auth.users WHERE id::text LIKE 'c2c20000-%'),
    'rc2Jobs', (SELECT count(*) FROM public.projects WHERE client_id = 'c2c20000-0000-4000-8000-000000000005'),
    'f01Actors', (SELECT count(*) FROM auth.users WHERE id::text LIKE 'f0180000-%'),
    'rc2Manifests', (SELECT count(*) FROM public.evidence_manifests WHERE idempotency_key LIKE 'rc2-sa-%'),
    'scopeEditions', (SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions'),
    'completeGrant', has_function_privilege('authenticated',
      to_regprocedure('public.complete_studio_service(uuid,uuid,text,text)'), 'EXECUTE'),
    'createGrant', has_function_privilege('authenticated',
      to_regprocedure('public.create_service_acceptance_request(uuid,uuid,uuid,text)'), 'EXECUTE'));`;
  const before = psql(args.refusalCheck, markersSql);
  const [systemId, serverAddr] = psql(args.refusalCheck,
    'SELECT system_identifier || \'|\' || host(inet_server_addr()) FROM pg_control_system();').split('|');
  const evidenceVars = ['-v', 'evidence_path_1=rc2-journey/refusal/a.pdf', '-v', `evidence_sha_1=${'a'.repeat(64)}`,
    '-v', 'evidence_path_2=rc2-journey/refusal/b.pdf', '-v', `evidence_sha_2=${'b'.repeat(64)}`];
  const attempts = {
    noIdentity: [],
    selfDerivedIdentity: ['-v', `owned_port=${target.port}`, '-v', `owned_server_addr=${serverAddr}`,
      '-v', `owned_system_id=${systemId}`, ...evidenceVars],
  };
  const results = {};
  for (const [name, vars] of Object.entries(attempts)) {
    const result = run('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', ...vars, args.refusalCheck, '-f', FIXTURE]);
    const output = `${result.stdout}${result.stderr}`.trim();
    results[name] = { exit: result.status, refused: /refused/i.test(output), output: output.split('\n').slice(-3) };
  }
  // The designer journey config refuses to load against the shared API.
  const config = run('pnpm', ['exec', 'playwright', 'test', '--config', CONFIG, '--list'], {
    cwd: DESIGNER,
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SHARED.api}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x',
      SUPABASE_SERVICE_ROLE_KEY: 'x', SUPABASE_DB_URL: args.refusalCheck, RC2_OWNED_DB_PORT: target.port,
      RC2_OWNED_API_PORT: SHARED.api, RC2_OWNED_SERVER_ADDR: serverAddr, RC2_OWNED_SYSTEM_ID: systemId },
  });
  results.designerConfig = { exit: config.status,
    refused: /not the owned local API/.test(`${config.stdout}${config.stderr}`) };
  const after = psql(args.refusalCheck, markersSql);
  const ok = Object.values(results).every((r) => r.exit !== 0 && r.refused) && before === after;
  const record = { at: new Date().toISOString(), target: `${target.hostname}:${target.port}`, before: JSON.parse(before),
    after: JSON.parse(after), unchanged: before === after, results, ok };
  fs.writeFileSync(path.join(evidence, 'refusal-check.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record, null, 2));
  return ok;
}

const args = parseArgs(process.argv.slice(2));
fs.mkdirSync(args.evidence, { recursive: true });
const ok = args.refusalCheck ? refusalCheck(args) : await journey(args);
console.log(ok ? 'RESULT: PASSED' : 'RESULT: FAILED');
process.exit(ok ? 0 : 1);
