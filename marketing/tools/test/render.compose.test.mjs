import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

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

/** Rewrite one frontmatter key of copy/<P>.final.md in a run (adds the key when absent). */
function setFrontmatter(dir, piece, key, value) {
  const file = path.join(dir, 'copy', `${piece}.final.md`);
  const text = fs.readFileSync(file, 'utf8');
  const line = `${key}: ${JSON.stringify(value)}`;
  const re = new RegExp(`^${key}:.*$`, 'm');
  const [, fm, rest] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  const next = re.test(fm) ? fm.replace(re, line) : `${fm}\n${line}`;
  fs.writeFileSync(file, `---\n${next}\n---\n${rest}`);
}

function run(name, args) {
  return spawnSync(process.execPath, [path.join(TOOLS, name), ...args], { encoding: 'utf8' });
}

// One shared run: copy the fixture, add a linkedin-landscape social piece (the fixture has none),
// pick J01's image, compose every kind, stand in for the deck agent, then render everything.
// The brief carries a place line; the one-pager carries its own eyebrow; the email asks for J01.
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-render-'));
fs.cpSync(FIXTURE, runDir, { recursive: true });
const briefFile = path.join(runDir, 'brief.md');
fs.writeFileSync(briefFile, `---\nplace: "Madison, Wisconsin"\n---\n\n${fs.readFileSync(briefFile, 'utf8')}`);
setFrontmatter(runDir, 'P04', 'eyebrow', 'Founding studios · Madison, WI [C01]');
setFrontmatter(runDir, 'P03', 'visual', 'J01');
setFrontmatter(runDir, 'P03', 'alt', 'A worktable with fabric swatches in morning light.');
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

test('render writes the poster PDF at 18x24 in plus 0.125 in bleed (1314x1746 pt) and the one-pager at Letter', () => {
  const poster = mediaBoxes(out('P07', 'P07.pdf'));
  assert.equal(poster.length, 1, 'poster PDF is one page');
  assert.deepEqual(poster[0], [0, 0, 1314, 1746]);
  assert.deepEqual(pngSize(out('P07', 'P07-preview.png')), { width: 1752, height: 2328 });
  const onePager = mediaBoxes(out('P04', 'P04.pdf'));
  assert.equal(onePager.length, 1, 'one-pager PDF is one page');
  assert.deepEqual(onePager[0], [0, 0, 612, 792]);
});

test('the poster image and paper band run to the sheet edge; its text stays at least 0.5 in inside trim', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1752, height: 2328 } });
    await page.goto(pathToFileURL(path.join(runDir, 'compose', 'P07', 'index.html')).href);
    const g = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
      const text = ['.eyebrow', 'h1', '.subhead', '.body', '.wordmark'].map((s) => r(s)).filter((b) => b.width > 0);
      return { sheet: r('.sheet'), media: r('.media'), band: r('.band'), text };
    });
    const bleed = 12; // 0.125 in at 96 px/in
    const safe = 48 + bleed; // 0.5 in inside trim
    assert.deepEqual([g.sheet.width, g.sheet.height], [1752, 2328]);
    assert.deepEqual([g.media.left, g.media.top, g.media.right], [0, 0, 1752]);
    assert.deepEqual([g.band.left, g.band.right, g.band.bottom], [0, 1752, 2328]);
    for (const b of g.text) {
      assert.ok(b.left >= safe && b.right <= 1752 - safe && b.bottom <= 2328 - safe, JSON.stringify(b));
    }
  } finally {
    await browser.close();
  }
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

test('email with visual: Jnn places one full-width image, alt from frontmatter, under the first paragraph', () => {
  const html = fs.readFileSync(path.join(runDir, 'compose', 'P03', 'index.html'), 'utf8');
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(imgs.length, 1, imgs.join('\n'));
  assert.match(imgs[0], /src="image\.png"/);
  assert.match(imgs[0], /alt="A worktable with fabric swatches in morning light\."/);
  assert.match(imgs[0], /width:100%/);
  const first = html.indexOf('somewhere to go.</p>');
  const second = html.indexOf('Patina keeps the paperwork moving');
  const img = html.indexOf(imgs[0]);
  assert.ok(first > 0 && first < img && img < second, `image sits between paragraphs one and two (${first}, ${img}, ${second})`);
  assert.match(composeLog, /^P03 \(email\): ok compose\/P03\/index\.html$/m);
  assert.ok(fs.existsSync(out('P03', 'image.png')), 'render carries the email image');
});

test('email: a missing visual composes IMAGE PENDING (image-missing); no visual is a letter only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-email-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    const html = () => fs.readFileSync(path.join(dir, 'compose', 'P03', 'index.html'), 'utf8');

    let r = run('compose.mjs', [dir, '--piece', 'P03']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^P03 \(email\): ok /m);
    assert.doesNotMatch(html(), /<img\b|IMAGE PENDING/);

    setFrontmatter(dir, 'P03', 'visual', 'J02');
    r = run('compose.mjs', [dir, '--piece', 'P03']);
    assert.match(r.stdout, /^P03 \(email\): image-missing compose\/P03\/index\.html \(no image for J02; composed with IMAGE PENDING\)$/m);
    assert.match(html(), /somewhere to go\.<\/p>\s*<div class="image-pending" role="img" aria-label="Image pending"[^>]*>IMAGE PENDING<\/div>\s*<p/);
    assert.doesNotMatch(html(), /<img\b/);
    const rows = JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8'));
    assert.deepEqual(rows.map((e) => [e.piece, e.step, e.status]), [['P03', 'compose', 'image-missing']]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the eyebrow is the piece\'s own (markers stripped), else the place line, never the concept name', () => {
  const composed = (id) => fs.readFileSync(path.join(runDir, 'compose', id, 'index.html'), 'utf8');
  assert.match(composed('P04'), /<p class="eyebrow">Founding studios · Madison, WI<\/p>/);
  for (const id of ['P01', 'P02', 'P07', 'P09']) {
    assert.match(composed(id), /<p class="eyebrow">Madison, Wisconsin<\/p>/, id);
  }
  for (const id of ['P01', 'P02', 'P03', 'P04', 'P07', 'P09']) {
    assert.doesNotMatch(composed(id), /First Hire/, `${id} must not carry the concept name`);
  }

  // No piece eyebrow and no place line: no eyebrow at all.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-eyebrow-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    run('compose.mjs', [dir, '--piece', 'P01']);
    const p01 = fs.readFileSync(path.join(dir, 'compose', 'P01', 'index.html'), 'utf8');
    assert.match(p01, /<p class="eyebrow"><\/p>/);
    assert.doesNotMatch(p01, /First Hire/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the one-pager is one column with a fixed 2.4 in image band', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
    await page.goto(pathToFileURL(path.join(runDir, 'compose', 'P04', 'index.html')).href);
    const g = await page.evaluate(() => ({
      media: document.querySelector('.media').getBoundingClientRect().height,
      sections: [...document.querySelectorAll('.section')].map((s) => {
        const h = s.querySelector('h2').getBoundingClientRect();
        const p = s.querySelector('p').getBoundingClientRect();
        return { hBottom: h.bottom, pTop: p.top, hLeft: h.left, pLeft: p.left, pWidth: p.width, sWidth: s.getBoundingClientRect().width };
      }),
    }));
    assert.ok(Math.abs(g.media - 2.4 * 96) < 0.5, `image band is ${g.media} px`);
    assert.equal(g.sections.length, 2);
    for (const s of g.sections) {
      assert.ok(s.hBottom <= s.pTop, `heading above body: ${JSON.stringify(s)}`);
      assert.equal(s.hLeft, s.pLeft);
      assert.equal(s.pWidth, s.sWidth, 'body runs the full measure');
    }
  } finally {
    await browser.close();
  }
});

test('a one-pager that overflows its page fails render ("one-pager overflows"), never clips', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-overflow-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    const para = 'The studio adds a hire and the next project runs itself instead of waiting on a memory. ';
    const sections = Array.from({ length: 8 }, (_, i) => `  - heading: Section ${'IVX'[i % 3]}\n    body: "${para.repeat(4).trim()}"`).join('\n');
    fs.writeFileSync(path.join(dir, 'copy', 'P04.final.md'), `---\ntitle: The Document, for a growing studio\nsections:\n${sections}\ncta: Ask for a walkthrough\n---\n`);
    const c = run('compose.mjs', [dir, '--piece', 'P04']);
    assert.match(c.stdout, /^P04 \(one-pager\): image-missing/m);
    const r = run('render.mjs', [dir, '--piece', 'P04']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^P04 \(one-pager\): failed \(one-pager overflows: content is \d+ px on a 1056 px page; cut copy\)$/m);
    assert.equal(fs.existsSync(path.join(dir, 'out', 'P04', 'P04.pdf')), false, 'no clipped PDF');
    const rows = JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8')).filter((e) => e.step === 'render');
    assert.deepEqual(rows.map((e) => [e.piece, e.status]), [['P04', 'failed']]);
    assert.match(rows[0].reason, /^one-pager overflows/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('render writes caption and alt text beside each social and pin PNG, markers stripped', () => {
  assert.equal(
    fs.readFileSync(out('P01', 'P01.caption.txt'), 'utf8'),
    "The studio's first hire took over the pulls. The lead designer kept the client conversation. The next project ran itself.\n\n#studiolife\n#interiordesign\n#patina\n",
  );
  assert.equal(fs.readFileSync(out('P01', 'P01.alt.txt'), 'utf8'), 'A design studio worktable with fabric swatches in warm afternoon light.\n');
  assert.equal(
    fs.readFileSync(out('P02', 'P02.caption.txt'), 'utf8'),
    "A close look at a Midwest studio's swatch wall, warm light, worktable close by.\n\n#swatches\n#studiostyle\n",
  );
  assert.equal(fs.readFileSync(out('P02', 'P02.alt.txt'), 'utf8'), 'Close detail of a design studio swatch wall.\n');
  assert.ok(fs.existsSync(out('P09', 'P09.caption.txt')));
  for (const id of ['P03', 'P04', 'P07']) assert.equal(fs.existsSync(out(id, `${id}.caption.txt`)), false, id);
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
