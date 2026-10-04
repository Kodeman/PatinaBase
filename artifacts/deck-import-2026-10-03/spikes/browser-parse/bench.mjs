// SQ-351 spike runner: serves the harness, drives headless Chromium via Playwright, samples memory,
// checks each manifest against the generator's ground truth, prints a markdown table.
// Usage: node bench.mjs <decksDir> <depsDir> <out.json> [quick]
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const [decksDir, depsDir, outPath, mode] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(depsDir, 'package.json'));
const { chromium } = require('playwright-core');
const fflateBrowser = join(depsDir, 'node_modules', 'fflate', 'esm', 'browser.js');
const fflateVersion = JSON.parse(readFileSync(join(depsDir, 'node_modules', 'fflate', 'package.json'), 'utf8')).version;
const pwVersion = JSON.parse(readFileSync(join(depsDir, 'node_modules', 'playwright-core', 'package.json'), 'utf8')).version;
const run = promisify(execFile);
const MB = 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STRATEGIES = ['unzipSync', 'unzip', 'stream'];
const SIZES = mode === 'quick' ? [10] : [10, 50, 100, 150];
const RUNS = [
  ...SIZES.flatMap((mb) => STRATEGIES.map((strategy) => ({ deck: `deck-${mb}.pptx`, strategy, caps: true, maxEdge: 2400 }))),
  ...(mode === 'quick' ? [] : [
    { deck: 'deck-100.pptx', strategy: 'unzip', caps: true, maxEdge: 0, note: 'crops at full resolution' },
    ...STRATEGIES.map((strategy) => ({ deck: 'deck-100-z64.pptx', strategy, caps: false, maxEdge: 2400, note: 'valid ZIP64, caps off' })),
    ...STRATEGIES.map((strategy) => ({ deck: 'deck-100-z64-noloc.pptx', strategy, caps: false, maxEdge: 2400, note: '#298 layout, caps off' })),
    { deck: 'deck-100-z64-noloc.pptx', strategy: 'unzipSync', caps: true, maxEdge: 2400, note: '#298 layout, caps on' },
  ]),
];

const files = {
  '/': [join(here, 'harness', 'index.html'), 'text/html'],
  '/parse.js': [join(here, 'harness', 'parse.js'), 'text/javascript'],
  '/fflate.js': [fflateBrowser, 'text/javascript'],
};
const server = createServer((req, res) => {
  const hit = files[req.url];
  if (!hit) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': hit[1], 'cache-control': 'no-store' }).end(readFileSync(hit[0]));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

/** RSS (KiB) of the Chromium process tree started with our tag, split by process type. */
async function rssTree(tag) {
  const { stdout } = await run('ps', ['-axo', 'pid=,ppid=,rss=,command='], { maxBuffer: 32 * MB });
  const procs = stdout.split('\n').filter(Boolean).map((l) => {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    return { pid: +m[1], ppid: +m[2], rss: +m[3], cmd: m[4] };
  });
  const root = procs.find((p) => p.cmd.includes(tag) && !p.cmd.includes('--type='));
  if (!root) return null;
  const tree = new Set([root.pid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of procs) if (!tree.has(p.pid) && tree.has(p.ppid)) { tree.add(p.pid); grew = true; }
  }
  const sum = { renderer: 0, gpu: 0, total: 0 };
  for (const p of procs) {
    if (!tree.has(p.pid)) continue;
    sum.total += p.rss;
    if (p.cmd.includes('--type=renderer')) sum.renderer += p.rss;
    if (p.cmd.includes('--type=gpu-process')) sum.gpu += p.rss;
  }
  return sum;
}

function verify(result, truth) {
  if (!result.ok) return `parse failed at ${result.stage}`;
  const got = result.manifest.slides;
  const want = truth.slidesInDisplayOrder;
  if (got.length !== want.length) return `slides ${got.length} != ${want.length}`;
  if (result.missingMedia) return `${result.missingMedia} referenced media missing`;
  for (let i = 0; i < want.length; i++) {
    const g = got[i];
    const w = want[i];
    if (g.key !== w.key) return `slide ${i}: key ${g.key} != ${w.key} (order)`;
    if (g.notesUrl !== w.notesUrl) return `slide ${i}: notes url`;
    if (g.pictures.length !== w.pictures.length) return `slide ${i}: ${g.pictures.length} pictures != ${w.pictures.length}`;
    for (let j = 0; j < w.pictures.length; j++) {
      const gp = g.pictures[j];
      const wp = w.pictures[j];
      if (gp.kind !== wp.kind) return `slide ${i} pic ${j}: kind ${gp.kind} != ${wp.kind}`;
      if (gp.link !== wp.link) return `slide ${i} pic ${j}: link ${gp.link} != ${wp.link}`;
      if (gp.crop.join() !== wp.crop.join()) return `slide ${i} pic ${j}: crop ${gp.crop} != ${wp.crop}`;
      if (!gp.bbox || gp.bbox.some((v, k) => Math.abs(v - wp.bbox[k]) > 2)) return `slide ${i} pic ${j}: bbox ${gp.bbox} != ${wp.bbox}`;
    }
  }
  return 'ok';
}

async function bench(spec) {
  const deckPath = join(decksDir, spec.deck);
  const truth = JSON.parse(readFileSync(`${deckPath}.truth.json`, 'utf8'));
  const tag = `--spike-run=${process.pid}-${Math.random().toString(36).slice(2)}`;
  const browser = await chromium.launch({ headless: true, args: [tag] });
  const peak = { heapUsed: 0, heapPlusBuffers: 0, renderer: 0, gpu: 0, total: 0, backingStorageSeen: false, heapSamples: 0, rssSamples: 0 };
  let result;
  try {
    const page = await browser.newPage();
    await page.goto(origin);
    await page.waitForFunction(() => window.harnessReady === true);
    const cdp = await page.context().newCDPSession(page);
    await page.setInputFiles('#deck', deckPath);
    await sleep(300);
    const base = await rssTree(tag);
    let sampling = true;
    const heapLoop = (async () => {
      while (sampling) {
        try {
          const h = await cdp.send('Runtime.getHeapUsage');
          peak.heapSamples += 1;
          peak.heapUsed = Math.max(peak.heapUsed, h.usedSize);
          if (h.backingStorageSize != null) peak.backingStorageSeen = true;
          peak.heapPlusBuffers = Math.max(peak.heapPlusBuffers, h.usedSize + (h.backingStorageSize ?? 0));
        } catch { /* page gone */ }
        await sleep(100);
      }
    })();
    const rssLoop = (async () => {
      while (sampling) {
        const s = await rssTree(tag).catch(() => null);
        if (s) {
          peak.rssSamples += 1;
          peak.renderer = Math.max(peak.renderer, s.renderer);
          peak.gpu = Math.max(peak.gpu, s.gpu);
          peak.total = Math.max(peak.total, s.total);
        }
        await sleep(100);
      }
    })();
    const opts = { strategy: spec.strategy, caps: spec.caps, maxEdge: spec.maxEdge };
    const wall = Date.now();
    result = await Promise.race([
      page.evaluate((o) => window.runParse(o), opts),
      sleep(240000).then(() => ({ ok: false, stage: 'timeout', error: 'no result after 240 s' })),
    ]).catch((e) => ({ ok: false, stage: 'renderer', error: String(e.message).split('\n')[0] }));
    result.wallMs = Date.now() - wall;
    sampling = false;
    await Promise.all([heapLoop, rssLoop]);
    peak.baseRenderer = base?.renderer ?? 0;
    peak.baseTotal = base?.total ?? 0;
  } finally {
    await browser.close().catch(() => {});
  }
  const verdict = verify(result, truth);
  return { spec, deckMB: statSync(deckPath).size / 1e6, slides: truth.slides, pictures: truth.pictures, result, peak, verdict };
}

const rows = [];
for (const spec of RUNS) {
  const r = await bench(spec);
  const { result: res, peak } = r;
  rows.push(r);
  const line = `${spec.deck} ${spec.strategy} caps=${spec.caps} edge=${spec.maxEdge}: ${res.ok ? `manifest ${res.tManifestMs} ms, crops ${res.tCropsMs} ms` : `FAILED ${res.stage}: ${res.error}`}; renderer peak ${(peak.renderer / 1024).toFixed(0)} MiB; verify ${r.verdict}`;
  console.error(line);
}
server.close();

const fmtS = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1));
const fmtMiB = (b) => (b / MB).toFixed(0);
const kib = (k) => (k / 1024).toFixed(0);
const out = [];
out.push(`fflate ${fflateVersion} · playwright-core ${pwVersion} · Chromium headless shell · ${new Date().toISOString()}`);
out.push('');
out.push('| deck | MB | slides | pics | strategy | caps | edge | manifest s | crops done s | peak JS heap MiB | peak heap+ArrayBuffers MiB | peak renderer RSS MiB (Δ) | peak GPU RSS MiB | peak Chrome tree RSS MiB | crops | verify |');
out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const { spec, result: res, peak } = r;
  const ok = res.ok;
  out.push(`| ${spec.deck} | ${r.deckMB.toFixed(1)} | ${r.slides} | ${r.pictures} | ${spec.strategy} | ${spec.caps ? 'on' : 'off'} | ${spec.maxEdge || 'full'} | ${ok ? fmtS(res.tManifestMs) : '—'} | ${ok ? fmtS(res.tCropsMs) : `FAIL (${res.stage}: ${res.error.slice(0, 90)})`} | ${fmtMiB(peak.heapUsed)} | ${peak.backingStorageSeen ? fmtMiB(peak.heapPlusBuffers) : 'n/a'} | ${kib(peak.renderer)} (+${kib(peak.renderer - peak.baseRenderer)}) | ${kib(peak.gpu)} | ${kib(peak.total)} | ${ok ? res.stats.crops : '—'} | ${r.verdict} |`);
}
console.log(out.join('\n'));
writeFileSync(outPath, JSON.stringify(rows.map(({ result, ...rest }) => ({ ...rest, result: { ...result, manifest: undefined } })), null, 2));
const baseFailures = rows.filter((r) => !r.spec.note && r.verdict !== 'ok');
process.exit(baseFailures.length ? 1 : 0);
