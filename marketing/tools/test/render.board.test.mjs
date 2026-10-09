import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'run-sample');

function tool(name, args, env) {
  return execFileSync(process.execPath, [path.join(TOOLS, name), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

/** Width and height of a JPEG from its first SOFn marker. */
function jpegSize(buf) {
  assert.equal(buf.readUInt16BE(0), 0xffd8, 'not a JPEG');
  let i = 2;
  while (i < buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  throw new Error('no SOF marker');
}

// A run with a Midjourney pick for J01, a FLUX placeholder for J02, a lint result, a rival
// draft, review notes and a seat ledger row; P01 and P02 rendered, the rest left unrendered.
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-board-test-'));
fs.cpSync(FIXTURE, runDir, { recursive: true });
const sample = path.join(runDir, 'mj', 'inbox', 'J01', 'sample.png');
const fluxFile = path.join(runDir, 'flux', 'J02', 'flux-1.png');
fs.mkdirSync(path.dirname(fluxFile), { recursive: true });
fs.copyFileSync(sample, fluxFile);
fs.writeFileSync(path.join(runDir, 'mj', 'picks.json'), JSON.stringify({ J01: sample }));
fs.writeFileSync(path.join(runDir, 'mj', 'assets.json'), JSON.stringify({
  J01: { source: 'midjourney', files: [sample] },
  J02: { source: 'flux-placeholder', files: [fluxFile] },
  J03: { source: 'missing', files: [] },
}));
fs.mkdirSync(path.join(runDir, 'critique'), { recursive: true });
fs.writeFileSync(path.join(runDir, 'critique', 'lint-P01.json'), JSON.stringify({
  file: 'copy/P01.final.md', kind: 'social', errors: [{ rule: 'unverified-claim', match: '[C01]', line: 3 }], warnings: [],
}));
// P02's lint run crashed and left an empty file; P03's lint reported voice-lint's fatal shape;
// P04 was never linted.
fs.writeFileSync(path.join(runDir, 'critique', 'lint-P02.json'), '');
fs.writeFileSync(path.join(runDir, 'critique', 'lint-P03.json'), JSON.stringify({
  file: 'copy/P03.final.md', fatal: 'YAMLParseError: unexpected end', errors: [{ rule: 'lint-crashed', match: 'YAMLParseError: unexpected end', line: 0 }], warnings: [],
}));
// review.md in the shape the Fable review writes: a preamble, one `## Pnn` section per piece
// (What I see, a findings table, a Voice line, `---` between pieces), then cross-piece notes that
// name several pieces. P03's table points back at P01 and P01's section mentions P06.
const REVIEW = `# Press review — sample

## State of the run (read first)

Preamble note: every piece in this run uses P01's palette.

---

## P01 — social, instagram-4x5 (\`out/P01/P01.png\`)

**What I see.** P01-ONLY: the hire sits low on the page; compare P06 slide 5.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | major | P01-FINDING lead with the handoff, not the hire | Swap the headline \\| move the date |

Voice: P01-VOICE passes.

---

## P03: pin, pinterest-2x3

**What I see.** P03-ONLY: tall placeholder.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | minor | Same as P01 #1 | P03-FIX keep the band |

Voice: P03-VOICE passes.

---

## P07 PR pitch, email

**What I see.** P07-ONLY: the subhead is generic.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | minor | P07-FINDING subject runs long | Cut to 40 chars |

Voice: P07-VOICE passes.

---

## Cross-piece notes

- CROSS-BULLET: P05 and P08 share a placeholder; fix both with P01.
`;
fs.writeFileSync(path.join(runDir, 'critique', 'review.md'), REVIEW);
fs.writeFileSync(path.join(runDir, 'copy', 'P01.sol.md'), '---\nheadline: A second set of hands\n---\n\nRival body from Sol.\n');
fs.writeFileSync(path.join(runDir, 'ledger.json'), JSON.stringify([
  { ts: '2026-10-08T12:00:00.000Z', piece: 'P01', step: 'draft', seat: 'rival', model: 'claude-gpt-6-sol[1m]', usage: { input_tokens: 1200, output_tokens: 345 } },
  { ts: '2026-10-08T12:01:00.000Z', piece: 'P02', step: 'sol-draft', seat: 'sol-draft', status: 'ok', model: 'cached-model', usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 } },
]));

tool('compose.mjs', [runDir]);
tool('render.mjs', [runDir, '--piece', 'P01']);
tool('render.mjs', [runDir, '--piece', 'P02']);
const boardLog = tool('board.mjs', [runDir]);
const boardFile = path.join(runDir, 'board.html');
const html = fs.readFileSync(boardFile, 'utf8');
const plan = JSON.parse(fs.readFileSync(path.join(runDir, 'plan.json'), 'utf8'));

/** The markup of one piece's card. */
function card(id) {
  const start = html.indexOf(`<article class="card" id="${id}">`);
  assert.ok(start >= 0, `card ${id}`);
  return html.slice(start, html.indexOf('</article>', start));
}

test.after(() => fs.rmSync(runDir, { recursive: true, force: true }));

test('board.html exists, is under 16 MB and lists every piece id', () => {
  assert.ok(fs.existsSync(boardFile), boardLog);
  assert.ok(fs.statSync(boardFile).size < 16 * 1024 * 1024);
  for (const piece of plan.pieces) assert.ok(html.includes(`id="${piece.id}"`), `missing ${piece.id}`);
});

test('board follows the artifact house rules', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] || '';
  const words = title.trim().split(/\s+/).length;
  assert.ok(words >= 2 && words <= 4, `title "${title}" is not 2-4 words`);
  assert.match(html, /@media \(prefers-color-scheme: dark\)\{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(html, /:root\[data-theme="dark"\]\{/);
  assert.match(html, /body\{[^}]*background:var\(--paper\)/);
  const hosts = new Set([...html.matchAll(/https?:\/\/([^/"'\s)]+)/g)].map((m) => m[1]));
  assert.deepEqual([...hosts].sort(), ['fonts.googleapis.com', 'fonts.gstatic.com']);
});

test('a piece card carries its inlined preview, final copy, rival draft, lint and review findings', () => {
  const p01 = card('P01');
  assert.match(p01, /<img class="preview" src="data:image\/(jpeg|png);base64,/);
  assert.match(p01, /The hire changed the handoff/);
  assert.match(p01, /<details><summary>Rival draft \(Sol\)<\/summary><pre class="final">[\s\S]*A second set of hands/);
  assert.match(p01, /1 error · 0 warnings/);
  assert.match(p01, /unverified-claim/);
  assert.match(p01, /lead with the handoff, not the hire/);
  assert.doesNotMatch(p01, /the subhead is generic/);
});

test('review: each card shows only its own ## Pnn section, rendered with an HTML table', () => {
  const own = ['P01', 'P03', 'P07'];
  const markers = (id) => [`${id}-ONLY`, `${id}-VOICE`];
  for (const piece of plan.pieces) {
    const c = card(piece.id);
    for (const other of own) {
      for (const m of markers(other)) {
        if (other === piece.id) assert.ok(c.includes(m), `${piece.id} card lacks its own ${m}`);
        else assert.ok(!c.includes(m), `${piece.id} card shows ${other}'s ${m}`);
      }
    }
    if (!own.includes(piece.id)) assert.doesNotMatch(c, /<h3>Review<\/h3>/, `${piece.id} has no section, so no Review block`);
  }
  const p01 = card('P01');
  assert.match(p01, /<table class="review"><thead><tr><th>#<\/th><th>Severity<\/th><th>Finding<\/th><th>Fix<\/th><\/tr><\/thead>/);
  assert.match(p01, /<td>major<\/td><td>P01-FINDING lead with the handoff, not the hire<\/td><td>Swap the headline \| move the date<\/td>/);
  assert.match(p01, /compare P06 slide 5/);
  assert.match(card('P07'), /P07-FINDING subject runs long/);
  // P03: its own table row, and P01 appears only inside the quoted "Same as P01 #1".
  const p03 = card('P03');
  assert.match(p03, /<td>Same as P01 #1<\/td><td>P03-FIX keep the band<\/td>/);
  assert.doesNotMatch(p03, /P01-FINDING/);
  const p03Body = p03.slice(p03.indexOf('<h3>Review</h3>'));
  assert.equal(p03Body.split('P01').length - 1, 1, 'P01 appears once on P03, in the quoted finding');
  // P06 is mentioned inside P01's section only; it gets nothing.
  assert.doesNotMatch(card('P06'), /compare P06 slide 5/);
});

test('review: cross-piece notes and the preamble stay in the Full review block, never on a card', () => {
  for (const piece of plan.pieces) {
    const c = card(piece.id);
    assert.ok(!c.includes('CROSS-BULLET'), `${piece.id} card carries the cross-piece bullet`);
    assert.ok(!c.includes('Preamble note'), `${piece.id} card carries the preamble`);
    assert.ok(!c.includes('Cross-piece notes'), `${piece.id} card carries the cross-piece heading`);
  }
  const full = html.slice(html.indexOf('<summary>Full review (critique/review.md)</summary>'));
  assert.ok(full.length < html.length, 'Full review block is present');
  assert.match(full, /CROSS-BULLET: P05 and P08 share a placeholder/);
  assert.match(full, /Preamble note/);
});

test('only pieces that use a FLUX image carry the PLACEHOLDER badge', () => {
  assert.match(card('P02'), />PLACEHOLDER</);
  assert.doesNotMatch(card('P01'), />PLACEHOLDER</);
  assert.doesNotMatch(card('P03'), />PLACEHOLDER</);
});

test('a piece with no image for a job carries the MISSING badge, next to PLACEHOLDER', () => {
  // P08 (video) uses J03, which ingest recorded as missing.
  assert.match(card('P08'), />MISSING</);
  assert.match(card('P08'), /title="No image for J03/);
  for (const id of ['P01', 'P02', 'P03', 'P07']) assert.doesNotMatch(card(id), />MISSING</, id);
});

test('lint: an empty or fatal lint file reads "Lint crashed"; no file reads "Not linted yet"', () => {
  assert.match(card('P02'), /Lint crashed/);
  assert.match(card('P02'), /the lint file is empty/);
  assert.doesNotMatch(card('P02'), /Not linted yet/);
  assert.match(card('P03'), /Lint crashed/);
  assert.match(card('P03'), /YAMLParseError: unexpected end/);
  assert.match(card('P04'), /Not linted yet\./);
  assert.doesNotMatch(card('P04'), /Lint crashed/);
  assert.doesNotMatch(card('P01'), /Lint crashed|Not linted yet/);
});

test('the header shows the concept and content test; the ledger shows seat, model and tokens', () => {
  assert.match(html, /<h1>First Hire<\/h1>/);
  assert.match(html, /a Midwest design studio taking on its first hire/);
  assert.match(html, /<td>rival<\/td><td>claude-gpt-6-sol\[1m\]<\/td><td class="num">1,545<\/td>/);
  assert.match(html, /<td>render<\/td>/);
});

test('ledger token counts include cache tokens', () => {
  assert.match(html, /<td>P02<\/td><td>sol-draft<\/td><td>sol-draft<\/td><td>cached-model<\/td><td class="num">1,115<\/td><td>ok<\/td>/);
});

test('without sips the board still inlines JPEG previews downscaled to <= 1200 px (Playwright)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-board-nosips-'));
  try {
    fs.cpSync(runDir, dir, { recursive: true });
    fs.rmSync(path.join(dir, 'board.html'));
    const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), 'press-nobin-'));
    tool('board.mjs', [dir], { PATH: emptyBin });
    const noSips = fs.readFileSync(path.join(dir, 'board.html'), 'utf8');
    const sizes = {};
    for (const id of ['P01', 'P02']) {
      const start = noSips.indexOf(`<article class="card" id="${id}">`);
      const m = /<img class="preview" src="data:image\/jpeg;base64,([^"]+)"/.exec(noSips.slice(start));
      assert.ok(m, `${id} preview is an inlined JPEG`);
      sizes[id] = jpegSize(Buffer.from(m[1], 'base64'));
    }
    // P01 renders at 1080x1350 and P02 at 1000x1500: both scale to a 1200 px long edge.
    assert.deepEqual(sizes, { P01: { width: 960, height: 1200 }, P02: { width: 800, height: 1200 } });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
