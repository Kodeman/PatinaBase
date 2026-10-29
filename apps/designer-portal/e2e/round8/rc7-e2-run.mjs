#!/usr/bin/env node
/**
 * RC-7 lane e2 runner: the only supported way to run the rc7-e2 service
 * acceptance, completion and care journeys (A20–A23). Lane-local: derived from
 * the RC-2 runner (run-consumer-journey.mjs, SQ-2337), which stays as it was.
 *
 *   node apps/designer-portal/e2e/round8/rc7-e2-run.mjs --evidence <dir> [--runs 2]
 *       --workdir <existing scratch parent> [--pins-from <dir with the .temp version pins>] [--keep-stack]
 *       [--defect-probe <1|2>]
 *
 * It starts ONE owned Supabase stack (project patina-rc7-e2, RC-7 lane e2 port
 * block 571: API 57121, DB 57122, shadow 57120, pooler 57129, inspector 57183;
 * designer portal 3110, client portal 3112) from this checkout's supabase/ in a
 * scratch workdir that holds only the five .temp version pins, with
 * edge-runtime and a functions env of exactly EMAIL_DEV_MODE=dry_run. It proves
 * the stack from Docker (CLI project label, published ports, container address
 * and cluster system identifier; it reads nothing from the shared stack),
 * switches pg_cron's active jobs off on the owned container, writes a sanitized
 * receipt (no keys; the numbered migration head read by query), then for each
 * run starts the client portal on 3112 and runs the lane entry
 * rc7-e2-consumer-journey.spec.ts in one playwright.round8.config.ts run on the
 * round-8 projects chromium and webkit-iphone, each driving every actor in its
 * own browser context: @rc7-e2-acceptance (applies the base and rc7-e2
 * fixtures: fresh jobs per project), @rc7-e2-paper, @rc7-e2-completion.
 *
 * --defect-probe <n> instead runs the @rc7-e2-defect-<n> repro once on chromium
 * with RC7_E2_DEFECT_PROBE=<n> (its fixme lifted) and passes only when
 * Playwright's JSON report shows that test alone failing, once, with one error
 * first located at its defect step and carrying the defect's actual value
 * (1: the Replace form offers no household member; 2: the stale_scope refusal
 * times out at the gateway).
 *
 * --workdir is required: an existing scratch directory outside home, / and any
 * checkout, under which the run creates and later removes its own child.
 *
 * The client portal is then stopped (SIGTERM, SIGKILL after a grace period) and
 * its port and the designer port must be free; any residue fails the run. Below
 * 20 GiB free disk it stops. At the end it stops the owned stack with
 * --no-backup (unless --keep-stack), checks the full teardown census
 * (containers and volumes, including removal of child-only resources), and
 * removes the scratch workdir.
 *
 * Never point it at Strata; it refuses anything but loopback, and refuses the
 * shared stack (54321/54322).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGNER = path.resolve(HERE, '../..');
const ROOT = path.resolve(DESIGNER, '../..');
const CLIENT_APP = path.join(ROOT, 'apps/client-portal');
const PROJECT = 'patina-rc7-e2';
const OFFSET = 2800;
const INSPECTOR_PORT = '57183';
const PORTS = { designer: '3110', client: '3112' };
const SHARED = { api: '54321', db: '54322' };
const OWNED = { api: String(54321 + OFFSET), db: String(54322 + OFFSET) };
const PINS = ['gotrue-version', 'postgres-version', 'rest-version', 'storage-migration', 'storage-version'];
const EXCLUDED_SERVICES = 'studio,mailpit,logflare,vector,imgproxy,postgres-meta';
// Legs: [tag, tests in the leg]. One playwright.round8.config.ts run of the lane
// entry on both round-8 projects, so round 8's global setup and teardown run
// once around all three legs (its teardown removes the F01 studio the legs
// share), with the client portal this runner keeps up on PORTS.client.
const E2_LEGS = [['@rc7-e2-acceptance', 3], ['@rc7-e2-paper', 1], ['@rc7-e2-completion', 3]];
const E2_PROJECTS = ['chromium', 'webkit-iphone'];
const E2_EXPECTED = E2_LEGS.reduce((sum, [, tests]) => sum + tests, 0) * E2_PROJECTS.length;
const E2_ARGS = ['--config', 'playwright.round8.config.ts', 'e2e/round8/rc7-e2-consumer-journey.spec.ts',
  '--grep', E2_LEGS.map(([tag]) => tag).join('|'), ...E2_PROJECTS.flatMap((name) => ['--project', name]), '--workers=1'];
// --defect-probe <n>: the DEFECT RC7-e2-<n> repro alone, fixme lifted, on chromium.
// Judged from Playwright's JSON report (classifyProbe), never from log text: the
// one test must fail once, with one error, first located at the defect step's
// line, carrying the defect's actual value.
const JOURNEY_FILE = 'rc7-e2-consumer-journey.journey.ts';
const DEFECT_PROBES = {
  1: {
    title: '@rc7-e2-defect-1 the Replace form offers the job household\'s other members and replaces the signer',
    line: 1242,
    step: "await expect(replace.getByText('No other household member is on file for this job.')).toHaveCount(0);",
    actual: [/^\s*Expected: 0\s*$/m, /^\s*Received: 1\s*$/m],
  },
  2: {
    title: '@rc7-e2-defect-2 a paper with a mismatched scope code is refused promptly with stale_scope through the API',
    line: 1303,
    step: "expect(refusal(viaApi), viaApi.body).toMatchObject({ code: '40001', message: 'stale_scope' });",
    actual: [/^\s*\+\s+"code": undefined,\s*$/m, /^\s*\+\s+"message": "The upstream server is timing out",\s*$/m],
  },
};
const probeArgs = (n) => ['--config', 'playwright.round8.config.ts', 'e2e/round8/rc7-e2-consumer-journey.spec.ts',
  '--grep', `@rc7-e2-defect-${n} `, '--project', 'chromium', '--workers=1', '--reporter=list,json'];
// RC-7 common rule: stop below 20 GiB free.
const MIN_FREE_KIB = 20 * 1024 * 1024;
const PROVIDER_KEY = /RESEND|SMTP|SENDGRID|POSTMARK|MAILGUN|SES_|TWILIO/i;

function parseArgs(argv) {
  const args = { runs: 2, keepStack: false, defectProbe: null };
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
    else if (flag === '--keep-stack') args.keepStack = true;
    else if (flag === '--defect-probe') {
      args.defectProbe = value();
      if (!DEFECT_PROBES[args.defectProbe]) throw new Error(`--defect-probe takes ${Object.keys(DEFECT_PROBES).join(' or ')}`);
    }
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!args.evidence) throw new Error('--evidence <dir> is required');
  if (!args.workdir) throw new Error('--workdir <existing scratch parent> is required');
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
  if (!(free >= MIN_FREE_KIB)) throw new Error(`free disk ${(free / 1048576).toFixed(2)} GiB is below 20 GiB; stopping`);
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
    .replace(/^(\s*inspector_port = )(\d+)$/m, (_, key) => `${key}${INSPECTOR_PORT}`);
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
  return { dbPort, apiPort, serverAddr, systemId, dbContainer: dbBox.Id.slice(0, 12) };
}

/**
 * Orchestrator ruling (RC-7, 2026-10-29): pg_cron jobs starting on the owned
 * stacks crashed Postgres backends on the shared Docker VM. The journey sends
 * through the edge function directly and needs no scheduled job, so active
 * jobs are switched off on the owned container (as its own superuser, inside
 * it) and the setting is read back.
 */
function quietCron(identity) {
  const box = `supabase_db_${PROJECT}`;
  if (clusterId(box) !== identity.systemId) throw new Error(`${box} is not the proven owned cluster`);
  const sql = (query) => must('docker', ['exec', box, 'sh', '-c',
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U supabase_admin -d postgres -X -q -t -A -c "${query}"`]);
  sql('ALTER SYSTEM SET cron.launch_active_jobs = off;');
  sql('SELECT pg_reload_conf();');
  const setting = sql('SHOW cron.launch_active_jobs;');
  if (setting !== 'off') throw new Error(`cron.launch_active_jobs reads ${setting} on the owned stack`);
  return setting;
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

const ANSI = /\u001b\[[0-9;]*m/g;

/**
 * A defect probe's verdict from Playwright's JSON report: no other error
 * anywhere, exactly one test (the probe's, on chromium) run once and failed
 * with exactly one error, located first at the defect step, whose message
 * carries the defect's actual value. Returns the reasons it is not the defect.
 */
function classifyProbe(report, probe) {
  const want = DEFECT_PROBES[probe];
  const reasons = [];
  if (!report || typeof report !== 'object') return ['no JSON report'];
  if ((report.errors ?? []).length !== 0) reasons.push(`${report.errors.length} error(s) outside the test`);
  const stats = report.stats ?? {};
  for (const [key, value] of [['expected', 0], ['unexpected', 1], ['flaky', 0], ['skipped', 0]]) {
    if (stats[key] !== value) reasons.push(`stats.${key} ${stats[key]} (want ${value})`);
  }
  const specs = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) specs.push(spec);
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  const tests = specs.flatMap((spec) => (spec.tests ?? []).map((entry) => ({ spec, entry })));
  if (tests.length !== 1) return [...reasons, `${tests.length} tests (want 1)`];
  const [{ spec, entry }] = tests;
  if (spec.title !== want.title) reasons.push(`title ${JSON.stringify(spec.title)}`);
  if (path.posix.basename(spec.file ?? '') !== JOURNEY_FILE) reasons.push(`file ${spec.file}`);
  if (entry.projectName !== 'chromium') reasons.push(`project ${entry.projectName}`);
  const results = entry.results ?? [];
  if (results.length !== 1) return [...reasons, `${results.length} results (want 1)`];
  const [result] = results;
  if (result.status !== 'failed') reasons.push(`status ${result.status} (want failed)`);
  const errors = result.errors ?? [];
  if (errors.length !== 1) reasons.push(`${errors.length} errors (want 1)`);
  const at = errors[0]?.location;
  if (!at || path.basename(at.file ?? '') !== JOURNEY_FILE || at.line !== want.line) {
    reasons.push(`first error at ${at ? `${path.basename(at.file ?? '')}:${at.line}` : 'no location'} (want ${JOURNEY_FILE}:${want.line})`);
  }
  // The assertion's own message, without the source excerpt that quotes the step.
  const message = String(result.error?.message ?? '').replace(ANSI, '');
  for (const pattern of want.actual) if (!pattern.test(message)) reasons.push(`actual value missing ${pattern}`);
  return reasons;
}

/**
 * One playwright.round8.config.ts run in the designer portal. Counted runs pass
 * on exit 0 with exactly `${expected} passed`; the defect probe passes on exit 1
 * when classifyProbe finds the defect in the JSON report. Review-and-send tap
 * lines are returned for the run log (the journey fails any send that needed a retap).
 */
function runLeg(evidence, label, legEnv, { args, expected, probe = null }) {
  const dir = path.join(evidence, label);
  fs.mkdirSync(dir, { recursive: true });
  const name = probe ? `e2-defect-probe-${probe}` : 'e2-rc7';
  const report = path.join(dir, name);
  const logPath = path.join(dir, `${name}.log`);
  const jsonPath = path.join(dir, `${name}.json`);
  const out = fs.openSync(logPath, 'w');
  const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...args], {
    cwd: DESIGNER,
    env: { ...legEnv, PLAYWRIGHT_OUTPUT_DIR: report, PLAYWRIGHT_EVIDENCE_DIR: report,
      ...(probe ? { PLAYWRIGHT_JSON_OUTPUT_FILE: jsonPath } : {}) },
    stdio: ['ignore', out, out],
    timeout: 75 * 60 * 1000,
    killSignal: 'SIGTERM',
  });
  fs.closeSync(out);
  const text = fs.readFileSync(logPath, 'utf8');
  // Judge only Playwright's own result lines: the dev server's log carries
  // unrelated text such as "[help-system] Sanity fetch failed".
  const lines = text.split('\n').filter((line) => !line.includes('[WebServer]') && /✓|✘|^\s*\d+ \w/.test(line));
  const summary = lines.filter((line) => /^\s*\d+ (passed|failed|flaky|skipped|did not run|interrupted)\b/.test(line))
    .map((line) => line.trim().replace(/ \(.*\)$/, ''));
  const taps = text.split('\n').filter((line) => line.includes('[RC7 e2 review-and-send]')).map((line) => line.trim());
  let verdict = [];
  if (probe) {
    let parsed = null;
    try { parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch { /* judged as no report */ }
    verdict = classifyProbe(parsed, probe);
    if (result.status !== 1) verdict.unshift(`exit ${result.status ?? result.signal} (want 1)`);
    verdict = verdict.length ? verdict.map((reason) => `probe NOT the defect: ${reason}`)
      : [`probe is the defect: 1 failed at ${JOURNEY_FILE}:${DEFECT_PROBES[probe].line} (json ${jsonPath})`];
  }
  const ok = probe
    ? verdict.length === 1 && verdict[0].startsWith('probe is the defect')
    : result.status === 0 && summary.length === 1 && summary[0] === `${expected} passed`;
  return { ok, status: result.status ?? result.signal, logPath, lines: [...lines, ...verdict], taps };
}

/**
 * RC-7 e2: the client portal on PORTS.client for the e2 legs, against the
 * owned API (the client config's own webServer env). Its own process group,
 * so stopClientServer ends next dev and its workers.
 */
async function startClientServer(evidence, label, legEnv) {
  const logPath = path.join(evidence, label, 'client-portal-dev.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const out = fs.openSync(logPath, 'w');
  const child = spawn('pnpm', ['exec', 'next', 'dev', '--webpack', '-p', PORTS.client], {
    cwd: CLIENT_APP, detached: true, stdio: ['ignore', out, out],
    env: { ...legEnv, SUPABASE_INTERNAL_URL: legEnv.NEXT_PUBLIC_SUPABASE_URL },
  });
  fs.closeSync(out);
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${PORTS.client}/auth/signin`);
      if (response.ok) {
        log(evidence, `client portal up on ${PORTS.client} (pid ${child.pid}) log=${logPath}`);
        return child;
      }
    } catch { /* not listening yet */ }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => { setTimeout(resolve, 2000); });
  }
  await stopClientServer(evidence, child);
  throw new Error(`client portal did not start on ${PORTS.client}; see ${logPath}`);
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** Waits until none of the ports is listening; true when all are free within the time. */
async function portsReleased(ports, ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    const busy = [];
    for (const port of ports) if (await portInUse(port)) busy.push(port);
    if (busy.length === 0) return true;
    if (Date.now() >= deadline) return false;
    await sleep(500);
  }
}

/** Whether any process of the client server's group is alive. */
function groupAlive(child) {
  try { process.kill(-child.pid, 0); return true; } catch { return false; }
}

/**
 * Stops the client portal's process group: SIGTERM, then SIGKILL after the
 * grace period, then waits for its port. False (residue) fails the journey:
 * a live group member or a listening port after the escalation.
 */
async function stopClientServer(evidence, child, { graceMs = 20_000, settleMs = 15_000 } = {}) {
  if (!child) return true;
  const signal = (name) => { try { process.kill(-child.pid, name); } catch { /* group already gone */ } };
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  const waitGone = async (ms) => {
    const deadline = Date.now() + ms;
    while ((!exited() || groupAlive(child)) && Date.now() < deadline) await sleep(250);
    return exited() && !groupAlive(child);
  };
  signal('SIGTERM');
  let gone = await waitGone(graceMs);
  let escalated = false;
  if (!gone) {
    escalated = true;
    signal('SIGKILL');
    gone = await waitGone(settleMs);
  }
  const released = await portsReleased([PORTS.client], settleMs);
  log(evidence, `client portal stop (pid ${child.pid}): ${escalated ? 'SIGTERM then SIGKILL' : 'SIGTERM'}; `
    + `process group ${gone ? 'gone' : 'RESIDUE'}; port ${PORTS.client} ${released ? 'free' : 'STILL LISTENING'}`);
  return gone && released;
}

function createOwnedWorkdir(parent) {
  if (!parent) throw new Error('unsafe workdir parent (none given); pass --workdir <existing scratch directory>');
  let target;
  try { target = fs.realpathSync(parent); } catch { throw new Error(`unsafe workdir parent ${parent}: does not exist`); }
  if (!fs.statSync(target).isDirectory()) throw new Error(`unsafe workdir parent ${target}: not a directory`);
  const root = fs.realpathSync(ROOT);
  if (target === path.parse(target).root || target === fs.realpathSync(os.homedir())
    || target === root || target.startsWith(`${root}${path.sep}`) || fs.existsSync(path.join(target, '.git'))) {
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
  for (const port of [OWNED.api, OWNED.db, PORTS.designer, PORTS.client]) {
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
    const cronLaunchActiveJobs = quietCron(identity);
    const receipt = {
      at: new Date().toISOString(), project: PROJECT, workdir,
      cli: must('supabase', ['--version']).split('\n')[0], head: must('git', ['-C', ROOT, 'rev-parse', 'HEAD']),
      api: { url: env.API_URL, port: identity.apiPort }, db: { port: identity.dbPort, container: identity.dbContainer,
        serverAddr: identity.serverAddr, systemId: identity.systemId },
      functions: functionsReceipt(), cronLaunchActiveJobs,
      ledgerMax: psql(env.DB_URL, 'SELECT max(version) FROM supabase_migrations.schema_migrations;'),
      // The ledger sorts as text, so a timestamped version outranks the numbered
      // files: the numbered head is read by its own query, and 00899 by name.
      numberedHead: psql(env.DB_URL, "SELECT max(version) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{5}$';"),
      migration00899: psql(env.DB_URL, "SELECT version || ' ' || name FROM supabase_migrations.schema_migrations WHERE version = '00899';"),
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
      PLAYWRIGHT_DESIGNER_PORT: PORTS.designer, PLAYWRIGHT_CLIENT_PORT: PORTS.client,
      RC7_CLIENT_URL: `http://localhost:${PORTS.client}`,
    };
    for (let n = 1; n <= args.runs; n += 1) {
      const label = `run${n}`;
      let ok = true;
      const client = await startClientServer(evidence, label, legEnv);
      try {
        requireDisk(evidence);
        const legArgs = args.defectProbe ? { args: probeArgs(args.defectProbe), expected: 1, probe: args.defectProbe }
          : { args: E2_ARGS, expected: E2_EXPECTED };
        const leg = runLeg(evidence, label, { ...legEnv, RC7_E2_ROUND8: '1',
          ...(args.defectProbe ? { RC7_E2_DEFECT_PROBE: args.defectProbe } : {}),
          SUPABASE_INTERNAL_URL: legEnv.NEXT_PUBLIC_SUPABASE_URL }, legArgs);
        log(evidence, `== ${label} ${args.defectProbe ? `defect probe @rc7-e2-defect-${args.defectProbe} on chromium`
          : `e2 ${E2_LEGS.map(([tag]) => tag).join('|')} on ${E2_PROJECTS.join(' + ')}`} exit=${leg.status} log=${leg.logPath}`);
        for (const line of leg.lines) log(evidence, `   ${line.trim()}`);
        for (const line of leg.taps) log(evidence, `   ${line}`);
        if (!leg.ok) ok = false;
      } finally {
        if (!(await stopClientServer(evidence, client))) ok = false;
      }
      // Playwright's own designer server must be gone too.
      if (!(await portsReleased([PORTS.designer], 30_000))) {
        log(evidence, `residue: port ${PORTS.designer} is still listening after the run`);
        ok = false;
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

const args = parseArgs(process.argv.slice(2));
fs.mkdirSync(args.evidence, { recursive: true });
const ok = await journey(args);
console.log(ok ? 'RESULT: PASSED' : 'RESULT: FAILED');
process.exit(ok ? 0 : 1);
