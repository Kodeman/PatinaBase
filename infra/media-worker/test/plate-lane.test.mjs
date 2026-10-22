// The container's plate lane under real Sharp (SQ-1634): container/server.mjs
// runs as its own process, as in the image, and the tests watch its child
// processes. Needs the container's dependencies; `npm test` runs `npm ci` in container/ when sharp is missing.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const sharp = createRequire(new URL('../container/package.json', import.meta.url))('sharp');
const SERVER = fileURLToPath(new URL('../container/server.mjs', import.meta.url));
const run = promisify(execFile);

// One libvips thread and one threadpool thread, like the 1-vCPU container.
sharp.concurrency(1);
const ENV = { ...process.env, UV_THREADPOOL_SIZE: '1', VIPS_CONCURRENCY: '1' };

let server;
let port;
let heavy;
let small;

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port: free } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return free;
}

before(async () => {
  // Noise defeats every encoder: this source keeps one process busy for seconds.
  heavy = await sharp({
    create: { width: 3000, height: 2000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  small = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#8a7a6a' } }).png().toBuffer();
  port = await freePort();
  server = spawn(process.execPath, [SERVER], { env: { ...ENV, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.once('exit', (code) => reject(new Error(`server exited with ${code}`)));
    server.stdout.on('data', (chunk) => String(chunk).includes('listening') && resolve());
  });
});

after(() => {
  server.kill('SIGCONT');
  server.kill('SIGKILL');
});

const plateJob = (budgetMs) => ({ op: 'plate_ingest', sourceKind: 'maker', focal: null, subjectBox: null, skip: [], budgetMs });

function post(job, body, signal) {
  return fetch(`http://127.0.0.1:${port}/process`, {
    method: 'POST',
    headers: { 'x-media-job': Buffer.from(JSON.stringify(job)).toString('base64') },
    body,
    signal,
  });
}

async function childrenOf(pid) {
  const { stdout } = await run('ps', ['-A', '-o', 'pid=,ppid=']);
  return stdout
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter(([, ppid]) => ppid === pid)
    .map(([child]) => child);
}

const exists = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false;
    throw err;
  }
};

// Samples the server's child processes until stopped: every pid seen, and the most alive at once.
function watchJobs() {
  const seen = new Set();
  let most = 0;
  let stopped = false;
  const sampling = (async () => {
    while (!stopped) {
      const alive = await childrenOf(server.pid);
      alive.forEach((pid) => seen.add(pid));
      most = Math.max(most, alive.length);
      await sleep(5);
    }
  })();
  return {
    seen,
    async stop() {
      stopped = true;
      await sampling;
      return { seen, most };
    },
  };
}

async function waitFor(check, ms, what) {
  const until = performance.now() + ms;
  while (!check()) {
    assert.ok(performance.now() < until, `${what} within ${ms} ms`);
    await sleep(5);
  }
}

async function smallJobSucceeds() {
  const res = await post(plateJob(), small);
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.equal(result.success, true);
  assert.deepEqual(result.outputs.map((o) => o.key), ['piece-256.avif', 'piece-256.webp']);
}

test('lane (a): a heavy job past its 300 ms budget answers 504 within 1.3 s, its process is gone, and the next job runs', async () => {
  const watch = watchJobs();
  const started = performance.now();
  const res = await post(plateJob(300), heavy);
  const elapsed = performance.now() - started;
  const { seen } = await watch.stop();
  assert.equal(res.status, 504);
  assert.match((await res.json()).error, /job deadline of 300 ms passed/);
  assert.ok(elapsed < 1_300, `answered after ${Math.round(elapsed)} ms`);
  assert.equal(seen.size, 1, 'the job ran in a process of its own');
  for (const pid of seen) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  await smallJobSucceeds();
});

test('lane (b): a second job while one runs gets 503 busy in under 200 ms, and two job processes are never alive', async () => {
  const watch = watchJobs();
  const first = post(plateJob(1_500), heavy);
  await sleep(100);
  const asked = performance.now();
  const second = await post(plateJob(), small);
  const refusedIn = performance.now() - asked;
  assert.equal(second.status, 503);
  assert.deepEqual(await second.json(), { error: 'busy' });
  assert.ok(refusedIn < 200, `refused after ${Math.round(refusedIn)} ms`);
  assert.equal((await first).status, 504);
  const { seen, most } = await watch.stop();
  assert.equal(most, 1, 'at most one job process alive at any sample');
  assert.equal(seen.size, 1, 'the refused job started no process');
  await smallJobSucceeds();
});

test('lane (c): a Worker that hangs up mid-job has the job process killed', async () => {
  const watch = watchJobs();
  const hangUp = new AbortController();
  const pending = post(plateJob(20_000), heavy, hangUp.signal).catch((err) => err.name);
  await waitFor(() => watch.seen.size === 1, 3_000, 'the job process starts');
  await sleep(200);
  const [pid] = watch.seen;
  assert.equal(exists(pid), true, 'the job is still running when the Worker hangs up');
  hangUp.abort();
  assert.equal(await pending, 'AbortError');
  await waitFor(() => !exists(pid), 1_000, 'the job process is gone');
  await watch.stop();
  await smallJobSucceeds();
});

test('lane (d): a job whose result lands after its deadline answers 504, never 200', async () => {
  // Stop the server so it can neither kill the job nor read its answer: the job
  // finishes past its 200 ms deadline and its result waits until the server resumes.
  const pending = post(plateJob(200), small);
  await sleep(50);
  server.kill('SIGSTOP');
  try {
    await sleep(1_500);
  } finally {
    server.kill('SIGCONT');
  }
  const res = await pending;
  assert.equal(res.status, 504);
  assert.match((await res.json()).error, /job deadline of 200 ms passed/);
  assert.deepEqual(await childrenOf(server.pid), []);
  await smallJobSucceeds();
});
