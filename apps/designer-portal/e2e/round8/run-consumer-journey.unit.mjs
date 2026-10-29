import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const runner = process.env.RC2_CLEANUP_SOURCE ?? fileURLToPath(new URL('./run-consumer-journey.mjs', import.meta.url));
const source = fs.readFileSync(runner, 'utf8');
const main = source.indexOf('\nconst args = parseArgs(process.argv.slice(2));');
assert.notEqual(main, -1, 'runner CLI boundary exists');
// Exercise the real journey and cleanup flow without running the CLI or any external command.
const moduleBody = source.slice(0, main).replace(/^import .*;\n/gm, '')
  .replaceAll('import.meta.url', 'moduleUrl');

function harness(t, options = {}) {
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(process.env.RC2_CLEANUP_TEST_TMPDIR ?? os.tmpdir(), 'rc2-cleanup-test-')));
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
    runLeg: (_evidence, _label, side, tag, env, expected = 1, args = []) => {
      state.legs.push([side, tag, expected, args, env.RC7_E2_ROUND8]);
      return { ok: options.legOk ?? true, status: 0, logPath: 'mock-leg', lines: [] };
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
    fileURLToPath: () => path.join(repo, 'apps/designer-portal/e2e/round8/run-consumer-journey.mjs'),
    moduleUrl: 'file:///mock-runner.mjs', console, Date: FakeDate,
    process: { env: {}, kill: options.kill ?? (() => { throw new Error('process.kill is forbidden in this test'); }) },
    mocks,
    spawnSync() { throw new Error('external processes are forbidden in cleanup tests'); },
  });
  vm.runInContext(`${moduleBody}\n${Object.keys(mocks).map((key) => `${key} = mocks.${key};`).join('\n')}
globalThis.journey = journey; globalThis.stopClientServer = stopClientServer; globalThis.E2_EXPECTED = E2_EXPECTED;`, context);
  return { ...state, state, repo, home, parent, evidence, expected: context.E2_EXPECTED,
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

test('RC-7 e2: by default one round8 run of the three e2 legs on chromium and webkit-iphone, inside one client-portal start/stop', async (t) => {
  const h = harness(t);
  assert.equal(await h.journey(), true);
  assert.deepEqual(h.legs.map(([side, tag]) => `${side} ${tag}`), [`e2 ${E2_TAGS}`]);
  const [[, , expected, args, round8]] = h.legs;
  assert.equal(expected, 14, '7 tests on each of the two projects');
  assert.equal(h.expected, 14);
  assert.equal(round8, '1', 'the lane entry registers the journey only with RC7_E2_ROUND8=1');
  assert.deepEqual([...args], ['--config', 'playwright.round8.config.ts', 'e2e/round8/rc7-e2-consumer-journey.spec.ts',
    '--grep', E2_TAGS, '--project', 'chromium', '--project', 'webkit-iphone', '--workers=1']);
  assert.deepEqual(h.clientServer, ['start', 'stop']);
});

test('RC-7 e2: --with-rc2 runs the five RC-2 legs, then the e2 legs inside one client-portal start/stop', async (t) => {
  const h = harness(t);
  assert.equal(await h.journey({ withRc2: true }), true);
  assert.deepEqual(h.legs.map(([side, tag]) => `${side} ${tag}`), [
    'designer @rc2-send', 'client @rc2-return', 'designer @rc2-resend', 'client @rc2-accept', 'designer @rc2-complete',
    `e2 ${E2_TAGS}`]);
  assert.deepEqual(h.legs.slice(5).map(([, , expected]) => expected), [14]);
  assert.deepEqual(h.clientServer, ['start', 'stop']);
});

test('RC-7 e2: a failed RC-2 leg never starts the client portal or the e2 legs', async (t) => {
  const h = harness(t, { legOk: false });
  assert.equal(await h.journey({ withRc2: true }), false);
  assert.deepEqual(h.legs.map(([, tag]) => tag), ['@rc2-send']);
  assert.deepEqual(h.clientServer, []);
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

for (const kind of ['root', 'home', 'repo', 'other checkout', 'symlink to checkout', 'symlink to home']) {
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
    const target = { root: path.parse(h.parent).root, home: h.home, repo: h.repo,
      'other checkout': checkout, 'symlink to checkout': link, 'symlink to home': homeLink }[kind];
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
