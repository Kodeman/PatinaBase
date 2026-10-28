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
  const state = { prepared: [], deleted: [], logs: [], commands: [], stackAttempted: false };
  const mocks = {
    requireDisk() {},
    portInUse: async () => false,
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
    stackEnv: () => ({ API_URL: 'http://127.0.0.1:57321', DB_URL: 'mock-db' }),
    proveOwned: () => ({}),
    functionsReceipt: () => ({}),
    psql: () => '',
    runLeg: () => ({ ok: options.legOk ?? true, status: 0, logPath: 'mock-leg', lines: [] }),
    log: (_evidence, line) => state.logs.push(line),
  };
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
    moduleUrl: 'file:///mock-runner.mjs', process: { env: {} }, console,
    mocks,
    spawnSync() { throw new Error('external processes are forbidden in cleanup tests'); },
  });
  vm.runInContext(`${moduleBody}\n${Object.keys(mocks).map((key) => `${key} = mocks.${key};`).join('\n')}\nglobalThis.journey = journey;`, context);
  return { ...state, state, repo, home, parent, evidence,
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
