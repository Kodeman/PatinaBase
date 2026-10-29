import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const runner = process.env.RC7_E2_RUNNER_SOURCE ?? fileURLToPath(new URL('./rc7-e2-run.mjs', import.meta.url));
const source = fs.readFileSync(runner, 'utf8');
const main = source.indexOf('\nconst args = parseArgs(process.argv.slice(2));');
assert.notEqual(main, -1, 'runner CLI boundary exists');
// Exercise the real journey and cleanup flow without running the CLI or any external command.
const moduleBody = source.slice(0, main).replace(/^import .*;\n/gm, '')
  .replaceAll('import.meta.url', 'moduleUrl');

function harness(t, options = {}) {
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(process.env.RC7_E2_RUNNER_TEST_TMPDIR ?? os.tmpdir(), 'rc7-e2-runner-test-')));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const repo = path.join(scratch, 'repo');
  const home = path.join(scratch, 'home');
  const parent = path.join(scratch, 'parent');
  const evidence = path.join(scratch, 'evidence');
  for (const dir of [repo, home, parent, evidence]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(parent, 'unrelated-evidence.txt'), 'keep');
  const state = { prepared: [], deleted: [], logs: [], commands: [], legs: [], clientServer: [], signals: [],
    stackAttempted: false, clock: 0 };
  const mocks = {
    requireDisk() {},
    // Ports are free unless a test names one as busy once the legs have run.
    portInUse: async (port) => state.legs.length > 0 && (options.busyAfterLegs ?? []).includes(port),
    sleep: async (ms) => { state.clock += ms; },
    containers: () => state.stackAttempted ? (options.containers ?? []) : [],
    defaultPins: () => '/unused-pins',
    prepareWorkdir(workdir) {
      state.prepared.push(workdir);
      if (options.preparationError) throw new Error('preparation failed');
      fs.mkdirSync(path.join(workdir, 'supabase'));
    },
    must(command, args) {
      state.commands.push([command, ...args]);
      if (command === 'supabase' && args[0] === 'start') {
        state.stackAttempted = true;
        if (options.startError) throw new Error('start failed');
        return '';
      }
      if (command === 'supabase' && args[0] === '--version') return 'mock-cli';
      if (command === 'git') return 'mock-head';
      if (command === 'docker' && args[0] === 'volume') {
        if (options.inspectionError) throw new Error('resource inspection failed');
        return (options.volumes ?? []).join('\n');
      }
      throw new Error(`unexpected command ${command} ${args}`);
    },
    run(command, args) {
      state.commands.push([command, ...args]);
      assert.equal(command, 'supabase');
      assert.equal(args[0], 'stop');
      if (options.stopError) throw new Error('stop could not launch');
      return { status: options.stopStatus ?? 0 };
    },
    stackEnv: () => ({ API_URL: 'http://127.0.0.1:57121', DB_URL: 'mock-db' }),
    proveOwned: () => ({}),
    quietCron: () => 'off',
    functionsReceipt: () => ({}),
    psql: () => '',
    runLeg: (_evidence, _label, env, leg) => {
      state.legs.push({ ...leg, round8: env.RC7_E2_ROUND8, defectEnv: env.RC7_E2_DEFECT_PROBE });
      return { ok: options.legOk ?? true, status: 0, logPath: 'mock-leg', lines: [], taps: options.taps ?? [] };
    },
    startClientServer: async () => { state.clientServer.push('start'); return { pid: 0 }; },
    stopClientServer: async () => { state.clientServer.push('stop'); return options.clientStopOk ?? true; },
    log: (_evidence, line) => state.logs.push(line),
  };
  if (options.diskKiB !== undefined) {
    // The real disk guard, over a mocked df reading.
    delete mocks.requireDisk;
    mocks.freeKiB = () => options.diskKiB;
  }
  if (options.realStop) delete mocks.stopClientServer;
  class FakeDate extends Date {
    static now() { return state.clock; }
  }
  const context = vm.createContext({
    fs: {
      ...fs,
      rmSync(target, settings) {
        state.deleted.push(target);
        // A broken runner must not let a negative control remove real home/root/repo paths.
        assert.ok(target.startsWith(`${scratch}${path.sep}`), 'deletion stays inside the test fixture');
        fs.rmSync(target, settings);
      },
    },
    os: { ...os, homedir: () => home }, path,
    fileURLToPath: () => path.join(repo, 'apps/designer-portal/e2e/round8/rc7-e2-run.mjs'),
    moduleUrl: 'file:///mock-runner.mjs', console, Date: FakeDate,
    process: { env: {}, kill: options.kill ?? (() => { throw new Error('process.kill is forbidden in this test'); }) },
    mocks,
    spawnSync: options.spawnSync ?? (() => { throw new Error('external processes are forbidden in cleanup tests'); }),
  });
  vm.runInContext(`${moduleBody}\nglobalThis.realRunLeg = runLeg;\n${Object.keys(mocks).map((key) => `${key} = mocks.${key};`).join('\n')}
globalThis.journey = journey; globalThis.stopClientServer = stopClientServer; globalThis.E2_EXPECTED = E2_EXPECTED;
globalThis.parseArgs = parseArgs; globalThis.classifyProbe = classifyProbe; globalThis.DEFECT_PROBES = DEFECT_PROBES;
globalThis.probeArgs = probeArgs;`, context);
  return { ...state, state, repo, home, parent, evidence, expected: context.E2_EXPECTED, context,
    stop: (child) => context.stopClientServer(evidence, child),
    journey: (args = {}) => context.journey({ evidence, runs: 1, workdir: parent, ...args }) };
}

test('pre-existing parent survives preparation failure; only the owned child is removed', async (t) => {
  const h = harness(t, { preparationError: true });
  await assert.rejects(h.journey(), /preparation failed/);
  assert.equal(fs.existsSync(h.parent), true, 'caller-owned parent survives');
  assert.equal(fs.readFileSync(path.join(h.parent, 'unrelated-evidence.txt'), 'utf8'), 'keep');
  assert.equal(h.prepared.length, 1);
  assert.equal(path.dirname(h.prepared[0]), h.parent);
  assert.notEqual(h.prepared[0], h.parent);
  assert.deepEqual(h.deleted, [h.prepared[0]]);
  assert.equal(fs.existsSync(h.prepared[0]), false);
  assert.equal(h.commands.length, 0, 'preparation failure never starts/stops a stack');
});

for (const [name, options] of [
  ['failed stop', { stopStatus: 1 }],
  ['remaining container', { containers: ['owned-container'] }],
  ['remaining volume', { volumes: ['owned-volume'] }],
  ['stop launch error', { stopError: true }],
  ['resource inspection error', { inspectionError: true }],
]) {
  test(`${name} makes the journey FAIL and preserves its recovery workdir`, async (t) => {
    const h = harness(t, options);
    let result;
    await assert.doesNotReject(async () => { result = await h.journey(); }, 'cleanup failure returns a FAIL verdict');
    assert.equal(result, false, 'cleanup failure cannot return PASS');
    assert.equal(fs.existsSync(h.prepared[0]), true, 'owned workdir retained for recovery');
    assert.equal(fs.existsSync(h.parent), true);
    assert.deepEqual(h.deleted, []);
    assert.ok(h.logs.some((line) => line.includes('teardown FAILED') && line.includes(h.prepared[0])));
  });
}

test('successful teardown removes only the owned child, not its parent or siblings', async (t) => {
  const h = harness(t);
  assert.equal(await h.journey(), true);
  assert.equal(path.dirname(h.prepared[0]), h.parent);
  assert.deepEqual(h.deleted, [h.prepared[0]]);
  assert.equal(fs.existsSync(h.prepared[0]), false);
  assert.equal(fs.readFileSync(path.join(h.parent, 'unrelated-evidence.txt'), 'utf8'), 'keep');
  const stop = h.commands.find((command) => command[1] === 'stop');
  assert.equal(stop[3], h.prepared[0], 'stop uses the exclusively created child');
  assert.ok(stop.includes('--no-backup'));
});

const E2_TAGS = '@rc7-e2-acceptance|@rc7-e2-paper|@rc7-e2-completion';

test('one round8 run of the three e2 legs on chromium and webkit-iphone, inside one client-portal start/stop', async (t) => {
  const h = harness(t);
  assert.equal(await h.journey(), true);
  assert.equal(h.legs.length, 1);
  const [leg] = h.legs;
  assert.equal(leg.expected, 14, '7 tests on each of the two projects');
  assert.equal(h.expected, 14);
  assert.equal(leg.round8, '1', 'the lane entry registers the journey only with RC7_E2_ROUND8=1');
  assert.equal(leg.probe, undefined);
  assert.equal(leg.defectEnv, undefined, 'the fixme stays on in counted runs');
  assert.deepEqual([...leg.args], ['--config', 'playwright.round8.config.ts', 'e2e/round8/rc7-e2-consumer-journey.spec.ts',
    '--grep', E2_TAGS, '--project', 'chromium', '--project', 'webkit-iphone', '--workers=1']);
  assert.deepEqual(h.clientServer, ['start', 'stop']);
});

test('the review-and-send tap lines reach the run log', async (t) => {
  const h = harness(t, { taps: ['[RC7 e2 review-and-send] webkit-iphone request 1: taps=1'] });
  assert.equal(await h.journey(), true);
  assert.ok(h.logs.includes('   [RC7 e2 review-and-send] webkit-iphone request 1: taps=1'));
});

for (const n of ['1', '2']) {
  test(`--defect-probe ${n} runs only the @rc7-e2-defect-${n} repro on chromium with its fixme lifted`, async (t) => {
    const h = harness(t);
    assert.equal(await h.journey({ defectProbe: n }), true);
    assert.equal(h.legs.length, 1);
    const [leg] = h.legs;
    assert.equal(leg.probe, n, 'judged as a probe: 1 failed at the defect step');
    assert.equal(leg.defectEnv, n);
    assert.equal(leg.round8, '1');
    assert.deepEqual([...leg.args], ['--config', 'playwright.round8.config.ts', 'e2e/round8/rc7-e2-consumer-journey.spec.ts',
      '--grep', `@rc7-e2-defect-${n} `, '--project', 'chromium', '--workers=1', '--reporter=list,json']);
    assert.deepEqual(h.clientServer, ['start', 'stop']);
  });
}

test('a failed leg fails the journey and still stops the client portal', async (t) => {
  const h = harness(t, { legOk: false });
  assert.equal(await h.journey(), false);
  assert.deepEqual(h.clientServer, ['start', 'stop']);
  assert.ok(h.logs.includes('JOURNEY run1 FAILED'));
});

test('partial startup failure still attempts teardown and preserves recovery on failed stop', async (t) => {
  const failed = harness(t, { startError: true, stopStatus: 1 });
  await assert.rejects(failed.journey(), /start failed/);
  assert.ok(failed.commands.some((command) => command[1] === 'stop'));
  assert.equal(fs.existsSync(failed.prepared[0]), true);
  assert.deepEqual(failed.deleted, []);

  const clean = harness(t, { startError: true });
  await assert.rejects(clean.journey(), /start failed/);
  assert.ok(clean.commands.some((command) => command[1] === 'stop'));
  assert.equal(fs.existsSync(clean.prepared[0]), false, 'clean teardown removes the owned child');
  assert.deepEqual(clean.deleted, [clean.prepared[0]]);
  assert.ok(clean.logs.some((line) => line.includes('teardown:') && line.includes('containers left 0')
    && line.includes('volumes left 0')));
});
test('--keep-stack intentionally retains the owned child without stopping or deleting', async (t) => {
  const h = harness(t);
  assert.equal(await h.journey({ keepStack: true }), true);
  assert.equal(path.dirname(h.prepared[0]), h.parent);
  assert.equal(fs.existsSync(h.prepared[0]), true);
  assert.equal(h.commands.some((command) => command[1] === 'stop'), false);
  assert.deepEqual(h.deleted, []);
});

for (const kind of ['root', 'home', 'repo', 'inside repo', 'other checkout', 'symlink to checkout', 'symlink to home',
  'missing', 'a file', 'none given']) {
  test(`rejects dangerous workdir parent: ${kind}`, async (t) => {
    const h = harness(t, { preparationError: true });
    const checkout = path.join(h.parent, 'other-checkout');
    fs.mkdirSync(checkout);
    fs.writeFileSync(path.join(checkout, '.git'), 'gitdir: /unused/worktrees/example');
    const link = path.join(h.parent, 'checkout-link');
    fs.symlinkSync(h.repo, link);
    fs.writeFileSync(path.join(h.repo, '.git'), 'gitdir: /unused/worktrees/example');
    const homeLink = path.join(h.parent, 'home-link');
    fs.symlinkSync(h.home, homeLink);
    const inside = path.join(h.repo, 'scratch');
    fs.mkdirSync(inside);
    const file = path.join(h.parent, 'a-file');
    fs.writeFileSync(file, 'x');
    const target = { root: path.parse(h.parent).root, home: h.home, repo: h.repo, 'inside repo': inside,
      'other checkout': checkout, 'symlink to checkout': link, 'symlink to home': homeLink,
      missing: path.join(h.parent, 'missing'), 'a file': file, 'none given': undefined }[kind];
    await assert.rejects(h.journey({ workdir: target }), /unsafe workdir parent/);
    assert.deepEqual(h.prepared, [], 'refuse before preparation');
    assert.deepEqual(h.deleted, [], 'refuse without deleting anything');
  });
}

test('disk guard: exactly 20 GiB free runs; one KiB less refuses before any stack command', async (t) => {
  const floor = 20 * 1024 * 1024;
  const at = harness(t, { diskKiB: floor });
  assert.equal(await at.journey(), true);
  assert.ok(at.logs.some((line) => line === 'disk: 20.00 GiB free'));

  const below = harness(t, { diskKiB: floor - 1 });
  await assert.rejects(below.journey(), /free disk 20\.00 GiB is below 20 GiB; stopping/);
  assert.deepEqual(below.commands, [], 'no stack is started below the floor');
  assert.deepEqual(below.prepared, []);

  const unreadable = harness(t, { diskKiB: Number.NaN });
  await assert.rejects(unreadable.journey(), /below 20 GiB/, 'an unreadable df reading refuses too');
});

test('client-portal residue on stop makes the journey FAIL', async (t) => {
  const h = harness(t, { clientStopOk: false });
  assert.equal(await h.journey(), false);
  assert.deepEqual(h.clientServer, ['start', 'stop']);
  assert.ok(h.logs.includes('JOURNEY run1 FAILED'));
});

test('a designer port still listening after the run makes the journey FAIL', async (t) => {
  const h = harness(t, { busyAfterLegs: ['3110'] });
  assert.equal(await h.journey(), false);
  assert.ok(h.logs.some((line) => line.includes('residue: port 3110 is still listening')));
  assert.ok(h.state.clock >= 30_000, 'it waited the full release window first');
});

function fakeGroup(state, { ignoreTerm = false, ignoreKill = false } = {}) {
  const child = { pid: 4242, exitCode: null, signalCode: null };
  let alive = true;
  const kill = (pid, signal) => {
    assert.equal(pid, -4242, 'signals go to the whole process group');
    if (signal === 0) {
      if (!alive) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      return true;
    }
    state.signals.push(signal);
    if ((signal === 'SIGTERM' && ignoreTerm) || (signal === 'SIGKILL' && ignoreKill)) return true;
    alive = false;
    child.signalCode = signal;
    return true;
  };
  return { child, kill };
}

test('client-portal stop: SIGTERM that ends the group is enough', async (t) => {
  const state = { signals: [] };
  const group = fakeGroup(state);
  const h = harness(t, { realStop: true, kill: group.kill });
  assert.equal(await h.stop(group.child), true);
  assert.deepEqual(state.signals, ['SIGTERM']);
  assert.ok(h.logs.some((line) => line.includes('process group gone; port 3112 free')));
});

test('client-portal stop: escalates to SIGKILL after the grace period', async (t) => {
  const state = { signals: [] };
  const group = fakeGroup(state, { ignoreTerm: true });
  const h = harness(t, { realStop: true, kill: group.kill });
  assert.equal(await h.stop(group.child), true);
  assert.deepEqual(state.signals, ['SIGTERM', 'SIGKILL']);
  assert.ok(h.state.clock >= 20_000, 'SIGKILL only after the 20 s grace');
  assert.ok(h.logs.some((line) => line.includes('SIGTERM then SIGKILL') && line.includes('gone')));
});

test('client-portal stop: a group that survives SIGKILL is residue (false)', async (t) => {
  const state = { signals: [] };
  const group = fakeGroup(state, { ignoreTerm: true, ignoreKill: true });
  const h = harness(t, { realStop: true, kill: group.kill });
  assert.equal(await h.stop(group.child), false);
  assert.ok(h.logs.some((line) => line.includes('process group RESIDUE')));
});

test('client-portal stop: a port still listening after the group is gone is residue (false)', async (t) => {
  const state = { signals: [] };
  const group = fakeGroup(state);
  const h = harness(t, { realStop: true, kill: group.kill, busyAfterLegs: ['3112'] });
  h.state.legs.push(['marker']);
  assert.equal(await h.stop(group.child), false);
  assert.ok(h.logs.some((line) => line.includes('port 3112 STILL LISTENING')));
});

test('--workdir is required (no os.tmpdir() default)', (t) => {
  const h = harness(t);
  assert.throws(() => h.context.parseArgs(['--evidence', h.evidence]), /--workdir <existing scratch parent> is required/);
  assert.equal(h.context.parseArgs(['--evidence', h.evidence, '--workdir', h.parent]).workdir, h.parent);
});

// ── Defect probe classification from Playwright's JSON reporter ────────────

const JOURNEY = fileURLToPath(new URL('./rc7-e2-consumer-journey.journey.ts', import.meta.url));
const JOURNEY_LINES = fs.readFileSync(JOURNEY, 'utf8').split('\n');
const ESC = '\u001b';
const color = (text) => `${ESC}[31m${text}${ESC}[39m`;

/** Playwright 1.58's JSON reporter shape (reporters/json.js) for one chromium test with one result. */
function report(probe, { line, rawMessage, stdout = [], status = 'failed', globalErrors = [], extraErrors = [],
  retries = 0, stats = {} }) {
  const want = probe === 'none' ? null : { 1: 1228, 2: 1260 }[probe];
  const location = { file: JOURNEY, line, column: 42 };
  // The formatted error carries the source excerpt, which quotes the step lines around the failure.
  const snippet = JOURNEY_LINES.slice(line - 3, line + 2).map((text, i) => `${i === 2 ? '>' : ' '} ${line - 2 + i} | ${text}`).join('\n');
  const result = (retry) => ({
    workerIndex: 0, parallelIndex: 0, status, duration: 26600,
    error: { message: rawMessage, stack: `Error: ${rawMessage}\n    at ${JOURNEY}:${line}:42`, location, snippet },
    errors: [{ location, message: `Error: ${rawMessage}\n\n${snippet}\n    at ${JOURNEY}:${line}:42` }, ...extraErrors],
    stdout: stdout.map((text) => ({ text })), stderr: [], retry, startTime: '2026-10-29T18:07:50.000Z',
    annotations: [], attachments: [],
  });
  const title = probe === 'none' ? 'something else' : (probe === '1'
    ? "@rc7-e2-defect-1 the Replace form offers the job household's other members and replaces the signer"
    : '@rc7-e2-defect-2 a paper with a mismatched scope code is refused promptly with stale_scope through the API');
  return {
    config: { rootDir: path.dirname(JOURNEY), projects: [{ name: 'chromium', retries }] },
    suites: [{ title: 'rc7-e2-consumer-journey.spec.ts', file: 'rc7-e2-consumer-journey.spec.ts', column: 0, line: 0,
      specs: [], suites: [{ title: 'RC-7 e2 defects (repro only; not in a counted runner leg)',
        file: 'rc7-e2-consumer-journey.journey.ts', line: 1225, column: 6, specs: [{
          title, ok: false, tags: [], id: 'abc-123', file: 'rc7-e2-consumer-journey.journey.ts', line: want ?? 1, column: 7,
          tests: [{ timeout: 600000, annotations: [], expectedStatus: 'passed', projectId: 'chromium', projectName: 'chromium',
            results: Array.from({ length: retries + 1 }, (_, i) => result(i)), status: 'unexpected' }],
        }] }] }],
    errors: globalErrors,
    stats: { startTime: '2026-10-29T18:07:45.000Z', duration: 30000, expected: 0, skipped: 0, unexpected: 1, flaky: 0, ...stats },
  };
}

const PROBE1_DEFECT = color('expect(locator).toHaveCount(expected) failed') + '\n\nLocator:  locator(\'[data-service-acceptance]\')'
  + ".getByText('No other household member is on file for this job.')\nExpected: 0\nReceived: 1\nTimeout:  5000ms";
const PROBE2_BODY = '{\n  "message":"The upstream server is timing out"\n}';
const PROBE2_DEFECT = `${PROBE2_BODY}\n\n${color('expect(received).toMatchObject(expected)')}\n\n- Expected  - 2\n+ Received  + 2\n\n`
  + '  Object {\n-   "code": "40001",\n-   "message": "stale_scope",\n+   "code": undefined,\n'
  + '+   "message": "The upstream server is timing out",\n  }';

test('drift guard: each probe step line is the defect assertion in the journey, under the probe title', (t) => {
  const h = harness(t);
  for (const n of ['1', '2']) {
    const want = h.context.DEFECT_PROBES[n];
    assert.equal(JOURNEY_LINES[want.line - 1].trim(), want.step, `probe ${n} line ${want.line}`);
    const source = `test('${want.title.replaceAll("'", "\\'")}'`;
    assert.ok(JOURNEY_LINES.some((text) => text.includes(source)), `probe ${n} title in the journey`);
  }
});

test('probe 1, the true defect: one failure at the step with Expected 0 / Received 1 classifies as the defect', (t) => {
  const h = harness(t);
  const line = h.context.DEFECT_PROBES['1'].line;
  assert.deepEqual([...h.context.classifyProbe(report('1', { line, rawMessage: PROBE1_DEFECT }), '1')], []);
});

test('probe 2, the true defect: the gateway 504 at the step classifies as the defect', (t) => {
  const h = harness(t);
  const line = h.context.DEFECT_PROBES['2'].line;
  const body = report('2', { line, rawMessage: PROBE2_DEFECT, stdout: [`[RC7 e2 defect-2 api] 504 60004ms ${PROBE2_BODY}\n`] });
  assert.deepEqual([...h.context.classifyProbe(body, '2')], []);
});

test('false green 1: a later step fails while the excerpt quotes the defect line; not the defect', (t) => {
  const h = harness(t);
  const step = h.context.DEFECT_PROBES['1'].line;
  // Past the defect step, the option assertion fails; its excerpt still shows line `step` and its text.
  const later = report('1', { line: step + 1, rawMessage: `${color('expect(locator).toHaveCount(expected) failed')}\n\n`
    + 'Locator:  locator(\'option[value="c2c26000-0000-4000-8000-000000000003"]\')\nExpected: 1\nReceived: 0' });
  assert.ok(later.suites[0].suites[0].specs[0].tests[0].results[0].errors[0].message
    .includes('No other household member is on file for this job.'), 'the old log-text check would have matched');
  const reasons = [...h.context.classifyProbe(later, '1')];
  assert.ok(reasons.some((reason) => reason.includes(`first error at rc7-e2-consumer-journey.journey.ts:${step + 1}`)), reasons.join('; '));
  assert.ok(reasons.some((reason) => reason.startsWith('actual value missing')), reasons.join('; '));
});

test('false green 2: the timeout text is logged but a later assertion fails; not the defect', (t) => {
  const h = harness(t);
  const step = h.context.DEFECT_PROBES['2'].line;
  const later = report('2', { line: step + 1, stdout: [`[RC7 e2 defect-2 api] 504 60004ms ${PROBE2_BODY}\n`],
    rawMessage: `${color('expect(received).toBeLessThan(expected)')}\n\nExpected: < 10000\nReceived:   60004` });
  const reasons = [...h.context.classifyProbe(later, '2')];
  assert.ok(reasons.some((reason) => reason.includes(`first error at rc7-e2-consumer-journey.journey.ts:${step + 1}`)), reasons.join('; '));
  assert.ok(reasons.some((reason) => reason.startsWith('actual value missing')), reasons.join('; '));
});

for (const [name, options, expect] of [
  ['a global (setup/teardown) error', { globalErrors: [{ message: 'globalTeardown failed' }] }, /error\(s\) outside the test/],
  ['a second (soft) error in the test', { extraErrors: [{ message: 'soft', location: { file: JOURNEY, line: 1, column: 1 } }] }, /2 errors \(want 1\)/],
  ['a retried test', { retries: 1 }, /2 results \(want 1\)/],
  ['a timed-out test', { status: 'timedOut' }, /status timedOut/],
  ['another test', { probe: 'none' }, /title/],
]) {
  test(`the true defect plus ${name} is rejected`, (t) => {
    const h = harness(t);
    const line = h.context.DEFECT_PROBES['2'].line;
    const body = report(options.probe ?? '2', { line, rawMessage: PROBE2_DEFECT, ...options });
    const reasons = [...h.context.classifyProbe(body, '2')];
    assert.ok(reasons.some((reason) => expect.test(reason)), reasons.join('; '));
  });
}

test('runLeg judges a probe from the JSON file Playwright writes, and fails without one', (t) => {
  for (const [label, write, ok] of [['true', true, true], ['no-json', false, false]]) {
    let seen;
    const h = harness(t, { spawnSync: (_command, args, options) => {
      seen = { args, env: options.env };
      fs.writeSync(options.stdio[1], '  ✘  1 [chromium] › journey\n  1 failed\n');
      if (write) {
        const line = h.context.DEFECT_PROBES['1'].line;
        fs.writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE, JSON.stringify(report('1', { line, rawMessage: PROBE1_DEFECT })));
      }
      return { status: 1 };
    } });
    const leg = h.context.realRunLeg(h.evidence, label, { RC7_E2_DEFECT_PROBE: '1' },
      { args: h.context.probeArgs('1'), expected: 1, probe: '1' });
    assert.equal(seen.env.PLAYWRIGHT_JSON_OUTPUT_FILE, path.join(h.evidence, label, 'e2-defect-probe-1.json'));
    assert.ok(seen.args.includes('--reporter=list,json'));
    assert.equal(leg.ok, ok, label);
    assert.ok(leg.lines.some((line) => line.startsWith(ok ? 'probe is the defect' : 'probe NOT the defect: no JSON report')),
      leg.lines.join('\n'));
  }
});

test('runLeg: the true defect JSON with exit 0 is not the defect', (t) => {
  const h = harness(t, { spawnSync: (_command, _args, options) => {
    const line = h.context.DEFECT_PROBES['1'].line;
    fs.writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE, JSON.stringify(report('1', { line, rawMessage: PROBE1_DEFECT })));
    return { status: 0 };
  } });
  const leg = h.context.realRunLeg(h.evidence, 'exit0', {}, { args: h.context.probeArgs('1'), expected: 1, probe: '1' });
  assert.equal(leg.ok, false);
  assert.ok(leg.lines.some((line) => line.includes('exit 0 (want 1)')));
});
