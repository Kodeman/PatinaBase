// US-34 F17 (SQ-966): asserts that the captured pre-fix baseline satisfies the F17 gate.
//   node artifacts/portal-responsiveness-build-2026-10-14/perf/check-baseline.mjs [baselineDir]
// Exits 0 when every check passes, 1 otherwise. The bands are the plan's (synthesis/plan.md §3.1
// row F17, from E1's measured P6 in baseline/data/e1-P6-1440.json); they are not tuned to the data.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunFiles, stat, summarize } from './stats.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] || path.join(here, 'baseline'));

const P6_TICK_BAND = [579, 789]; // tick shows its new state, median ms (E1: 748 [579–789])
const P6_REFETCH_BAND = [27, 29]; // refetches after the write, every run (E1: 27 [27–29])
const MIN_RUNS = 3;
const THROTTLE = { cpu: 4, latency: 165, downloadThroughput: 1012500, uploadThroughput: 168750 };
const SCENARIOS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];
// The desk's help panel reads published help docs from the public Sanity CDN (project kv3qrinl,
// read-only, no Patina data). Every other origin, above all Strata and *.patina.cloud, fails.
const PUBLIC_READS = ['https://kv3qrinl.apicdn.sanity.io'];
const WRITES = { P7: 'phaseShowsState', P8: 'roomShown', P9: 'sendingShown' };

const failures = [];
const pass = [];
const check = (ok, msg) => (ok ? pass : failures).push(msg);

const files = readRunFiles(dir);
const summary = summarize(dir);
const fileOf = (s) => files[`${s}-1440`];

for (const s of SCENARIOS) {
  const f = fileOf(s);
  if (!f) { check(false, `${s}: local-${s}-1440.json missing`); continue; }
  const ok = f.rows.filter((r) => !r.error);
  check(ok.length >= MIN_RUNS, `${s}: ${ok.length} successful runs (need >= ${MIN_RUNS}; ${f.rows.length - ok.length} error rows)`);
  const t = f.throttling || {};
  const n = t.network || {};
  check(t.cpu === THROTTLE.cpu && n.latency === THROTTLE.latency && n.downloadThroughput === THROTTLE.downloadThroughput && n.uploadThroughput === THROTTLE.uploadThroughput,
    `${s}: throttling is 4x CPU + Fast 4G (${JSON.stringify(t)})`);
  const windows = ok.flatMap((r) => (r.tick ? [r.tick, r.untick] : r.act ? [r.act] : [r]));
  check(windows.every((w) => typeof w.authUser === 'number' && typeof w.reactCommits === 'number' && typeof w.cls === 'number' && 'arrivalStart' in w && 'arrivalEnd' in w),
    `${s}: every window records authUser, reactCommits, cls and arrival marks`);
  const external = [...new Set(windows.flatMap((w) => w.externalRequests || []))];
  check(external.every((o) => PUBLIC_READS.includes(o)),
    `${s}: no request left localhost except the public help CDN (${external.join(', ') || 'none'})`);
}

// The gate proper: today's P6 reproduces as a distribution.
const p6 = fileOf('P6');
if (p6) {
  const ticks = p6.rows.filter((r) => !r.error && r.tick).map((r) => r.tick);
  const shows = stat(ticks.map((t) => t.tickShowsState));
  check(ticks.length >= MIN_RUNS && shows && shows.n === ticks.length, `P6: ${ticks.length} tick runs, each with a tick-shows-state mark`);
  check(ticks.every((t) => !t.capped), 'P6: no tick run hit the settle cap');
  if (shows) {
    check(shows.med >= P6_TICK_BAND[0] && shows.med <= P6_TICK_BAND[1],
      `P6: tick-shows-state median ${shows.med} ms in [${P6_TICK_BAND.join(', ')}] (runs ${shows.values.join(', ')})`);
  }
  const refetch = ticks.map((t) => t.refetchesAfterWrite);
  check(refetch.length >= MIN_RUNS && refetch.every((c) => c >= P6_REFETCH_BAND[0] && c <= P6_REFETCH_BAND[1]),
    `P6: refetches after the write ${refetch.join(', ')} each in [${P6_REFETCH_BAND.join(', ')}]`);
  check(p6.rows.every((r) => r.error || r.fixture?.teardown?.left === 0), 'P6: fixture task deleted after every run');
}

// Write scenarios: the write happened, its visible state was timed, the fixture was undone.
for (const [s, mark] of Object.entries(WRITES)) {
  const f = fileOf(s);
  if (!f) continue;
  const ok = f.rows.filter((r) => !r.error);
  check(ok.every((r) => r.act && r.act.writeEnd != null && typeof r.act.refetchesAfterWrite === 'number' && r.act[mark] != null),
    `${s}: every run saw its write, counted refetches and timed ${mark}`);
  check(f.rows.every((r) => r.error || r.fixture?.teardown), `${s}: fixture teardown recorded for every run`);
}
const p8 = fileOf('P8');
if (p8) check(p8.rows.every((r) => r.error || r.fixture.teardown.deleted === 1), 'P8: exactly the one fixture room deleted after every run');
const p9 = fileOf('P9');
if (p9) {
  check(p9.rows.every((r) => r.error || (r.act.sendBlocked >= 1 && r.fixture.teardown.neverSent === true)),
    'P9: every send request was blocked in the browser and the draft was never claimed or sent');
}

console.log(`F17 baseline check: ${dir}`);
for (const m of pass) console.log(`  ok   ${m}`);
for (const m of failures) console.log(`  FAIL ${m}`);
const p6s = summary['P6-1440:tick'];
if (p6s) console.log(`P6 tick: tickShowsState ${JSON.stringify(p6s.metrics.tickShowsState?.values)}; refetchesAfterWrite ${JSON.stringify(p6s.metrics.refetchesAfterWrite?.values)}`);
// Informational: the host's 1-minute load average at each run's start (lab.mjs hostLoad).
const loads = Object.values(files).flatMap((f) => f.rows.map((r) => r.hostLoad)).filter((x) => typeof x === 'number');
if (loads.length) console.log(`host load at run start: min ${Math.min(...loads)}, max ${Math.max(...loads)} (${loads.length} runs; recorded, not gated)`);
console.log(failures.length ? `FAILED: ${failures.length} check(s)` : `PASSED: ${pass.length} checks`);
process.exit(failures.length ? 1 : 0);
