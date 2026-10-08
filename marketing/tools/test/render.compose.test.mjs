import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { fill, stripClaims } from '../compose.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'run-sample');
const DECK_TEMPLATE = path.resolve(TOOLS, '..', 'templates', 'deck', 'index.html');

function tool(name, args) {
  return execFileSync(process.execPath, [path.join(TOOLS, name), ...args], { encoding: 'utf8' });
}

/** Width and height from a PNG's IHDR chunk (bytes 16-23, big-endian). */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString('ascii', 12, 16), 'IHDR', `${file} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function mediaBoxes(file) {
  const text = fs.readFileSync(file).toString('latin1');
  return [...text.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => m.slice(1).map(Number));
}

// One shared run: copy the fixture, add a linkedin-landscape social piece (the fixture has none),
// pick J01's image, compose every kind, stand in for the deck agent, then render everything.
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-render-'));
fs.cpSync(FIXTURE, runDir, { recursive: true });
const plan = JSON.parse(fs.readFileSync(path.join(runDir, 'plan.json'), 'utf8'));
plan.pieces.push({ id: 'P09', kind: 'social', channel: 'linkedin-landscape', angle: 'feed card', brief: '', claims: ['C01'], visuals: ['J01'] });
plan.jobs.find((j) => j.id === 'J01').pieceIds.push('P09');
fs.writeFileSync(path.join(runDir, 'plan.json'), JSON.stringify(plan, null, 2));
fs.copyFileSync(path.join(runDir, 'copy', 'P01.final.md'), path.join(runDir, 'copy', 'P09.final.md'));
const sample = path.join(runDir, 'mj', 'inbox', 'J01', 'sample.png');
fs.writeFileSync(path.join(runDir, 'mj', 'picks.json'), JSON.stringify({ J01: sample }));

const composeLog = tool('compose.mjs', [runDir]);
const composedDeck = fs.existsSync(path.join(runDir, 'compose', 'P05'));
fs.mkdirSync(path.join(runDir, 'compose', 'P05'), { recursive: true });
fs.copyFileSync(DECK_TEMPLATE, path.join(runDir, 'compose', 'P05', 'index.html'));
fs.copyFileSync(sample, path.join(runDir, 'compose', 'P05', 'image-J01.png'));
const renderLog = tool('render.mjs', [runDir]);
const ledger = JSON.parse(fs.readFileSync(path.join(runDir, 'ledger.json'), 'utf8'));
const out = (...p) => path.join(runDir, 'out', ...p);

test.after(() => fs.rmSync(runDir, { recursive: true, force: true }));

test('fill escapes {{key}}, inserts {{{key}}} raw, and leaves unknown keys for the sender', () => {
  assert.equal(fill('{{a}} | {{{a}}} | {{unsub_url}}', { a: '<b>&"' }), '&lt;b&gt;&amp;&quot; | <b>&" | {{unsub_url}}');
  assert.equal(fill('{{a}}', { a: '{{b}}', b: 'no' }), '{{b}}');
});

test('stripClaims removes [Cnn] markers from nested copy', () => {
  assert.deepEqual(stripClaims({ s: 'Ran itself. [C01]', l: ['x [C12] y'] }), { s: 'Ran itself.', l: ['x y'] });
});

test('compose writes each templated kind, pitch.md for pr-pitch, and skips deck and video', () => {
  for (const id of ['P01', 'P02', 'P03', 'P04', 'P07', 'P09']) {
    assert.ok(fs.existsSync(path.join(runDir, 'compose', id, 'index.html')), `${id} index.html`);
  }
  assert.match(composeLog, /P05 \(deck\): skipped/);
  assert.match(composeLog, /P08 \(video\): skipped/);
  assert.equal(composedDeck, false, 'compose must not write compose/P05');
  assert.equal(fs.existsSync(path.join(runDir, 'compose', 'P08')), false);

  const pitch = fs.readFileSync(path.join(runDir, 'compose', 'P06', 'pitch.md'), 'utf8');
  assert.match(pitch, /^Subject: A Midwest design studio/);
  assert.doesNotMatch(pitch, /\[C\d+\]/);
});

test('compose strips claim markers, copies the picked image, and marks a missing image pending', () => {
  const p01 = fs.readFileSync(path.join(runDir, 'compose', 'P01', 'index.html'), 'utf8');
  assert.doesNotMatch(p01, /\[C\d+\]/);
  assert.match(p01, /data-channel="instagram-4x5"/);
  assert.match(p01, /The hire changed the handoff/);
  assert.match(p01, /src="image\.png"/);
  assert.ok(fs.existsSync(path.join(runDir, 'compose', 'P01', 'image.png')));
  assert.doesNotMatch(p01, /\{\{/);

  const p07 = fs.readFileSync(path.join(runDir, 'compose', 'P07', 'index.html'), 'utf8');
  assert.doesNotMatch(p07, /\[C\d+\]/);
  assert.match(p07, /class="wordmark-type">Patina</);

  // J02 has no pick and no assets.json entry.
  const p02 = fs.readFileSync(path.join(runDir, 'compose', 'P02', 'index.html'), 'utf8');
  assert.match(p02, /IMAGE PENDING/);
});

test('a missing lead image is reported image-missing (output line and ledger), not ok', () => {
  assert.match(composeLog, /^P02 \(pin\): image-missing compose\/P02\/index\.html \(no image for J02; composed with IMAGE PENDING\)$/m);
  assert.match(composeLog, /^P01 \(social\): ok compose\/P01\/index\.html$/m);
  const missing = ledger.filter((e) => e.step === 'compose' && e.status === 'image-missing');
  assert.deepEqual(missing.map((e) => e.piece), ['P02']);
  assert.match(missing[0].reason, /J02/);
});

test('a failing piece does not stop the others; its stale composition is removed and compose exits 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-compose-fail-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    tool('compose.mjs', [dir]);
    const p01 = path.join(dir, 'compose', 'P01', 'index.html');
    const p03 = path.join(dir, 'compose', 'P03', 'index.html');
    assert.ok(fs.existsSync(p01));
    // P01's copy goes missing (a broken revise), and P03's composition is cleared to prove the
    // pieces after P01 still compose.
    fs.rmSync(path.join(dir, 'copy', 'P01.final.md'));
    fs.rmSync(p03);
    const r = spawnSync(process.execPath, [path.join(TOOLS, 'compose.mjs'), dir], { encoding: 'utf8' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^P01 \(social\): failed \(.*P01\.final\.md.*\)$/m);
    assert.match(r.stderr, /compose\.mjs: 1 piece\(s\) failed: P01/);
    assert.equal(fs.existsSync(p01), false, 'stale P01 composition must not survive a failed recompose');
    assert.ok(fs.existsSync(p03), 'P03 composed after P01 failed');
    // This copy has no picks.json or assets.json, so the last template piece composes without its image.
    assert.match(r.stdout, /^P07 \(poster\): image-missing compose\/P07\/index\.html/m);
    const ledgerRows = JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8'));
    const failed = ledgerRows.filter((e) => e.step === 'compose' && e.status === 'failed');
    assert.deepEqual(failed.map((e) => e.piece), ['P01']);

    // render then skips P01 instead of rendering the old copy.
    const render = spawnSync(process.execPath, [path.join(TOOLS, 'render.mjs'), dir, '--piece', 'P01'], { encoding: 'utf8' });
    assert.match(render.stdout, /P01 \(social\): skipped \(compose\/P01\/index\.html is missing/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('render writes PNGs at the exact channel pixel size', () => {
  assert.deepEqual(pngSize(out('P01', 'P01.png')), { width: 1080, height: 1350 });
  assert.deepEqual(pngSize(out('P09', 'P09.png')), { width: 1200, height: 627 });
  assert.deepEqual(pngSize(out('P02', 'P02.png')), { width: 1000, height: 1500 });
});

test('render writes the poster PDF at 18x24 in and the one-pager at Letter', () => {
  const poster = mediaBoxes(out('P07', 'P07.pdf'));
  assert.ok(poster.length >= 1, 'poster PDF has a MediaBox');
  for (const box of poster) assert.deepEqual(box, [0, 0, 1296, 1728]);
  for (const box of mediaBoxes(out('P04', 'P04.pdf'))) assert.deepEqual(box, [0, 0, 612, 792]);
});

test('render copies the email html and writes a 600 px wide preview', () => {
  const html = fs.readFileSync(out('P03', 'P03.html'), 'utf8');
  assert.match(html, /Your studio just added its first hire/);
  assert.doesNotMatch(html, /\[C\d+\]/);
  assert.equal(pngSize(out('P03', 'P03.png')).width, 600);
});

test('render makes the composed deck one file plus a 16:9 PDF, one page per slide', () => {
  const html = fs.readFileSync(out('P05', 'P05.html'), 'utf8');
  assert.match(html, /src="data:image\/png;base64,/);
  assert.doesNotMatch(html, /src="image-J01\.png"/);
  const boxes = mediaBoxes(out('P05', 'P05.pdf'));
  assert.equal(boxes.length, 3);
  for (const box of boxes) assert.deepEqual(box, [0, 0, 1440, 810]);
});

test('render records video as skipped or rendered in the ledger', () => {
  const video = ledger.filter((e) => e.piece === 'P08' && e.step === 'render');
  assert.equal(video.length, 1, renderLog);
  if (video[0].status === 'ok') {
    assert.ok(fs.existsSync(out('P08', 'P08.mp4')));
  } else {
    assert.equal(video[0].status, 'skipped');
    assert.ok(video[0].reason);
  }
});

test('every render output has a ledger entry', () => {
  const outputs = new Set(ledger.filter((e) => e.status === 'ok').map((e) => e.output));
  for (const dir of fs.readdirSync(out())) {
    for (const name of fs.readdirSync(out(dir))) {
      if (/^image\./.test(name)) continue; // the email's copied image travels with its html
      assert.ok(outputs.has(path.join('out', dir, name)), `ledger missing out/${dir}/${name}`);
    }
  }
  assert.equal(ledger.filter((e) => e.status === 'failed').length, 0, renderLog);
});
