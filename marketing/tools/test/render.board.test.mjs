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

function tool(name, args) {
  return execFileSync(process.execPath, [path.join(TOOLS, name), ...args], { encoding: 'utf8' });
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
fs.writeFileSync(path.join(runDir, 'critique', 'review.md'), '# Review\n\n- P01: lead with the handoff, not the hire.\n- P07: the subhead is generic.\n');
fs.writeFileSync(path.join(runDir, 'copy', 'P01.sol.md'), '---\nheadline: A second set of hands\n---\n\nRival body from Sol.\n');
fs.writeFileSync(path.join(runDir, 'ledger.json'), JSON.stringify([
  { ts: '2026-10-08T12:00:00.000Z', piece: 'P01', step: 'draft', seat: 'rival', model: 'claude-gpt-6-sol[1m]', usage: { input_tokens: 1200, output_tokens: 345 } },
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

test('only pieces that use a FLUX image carry the PLACEHOLDER badge', () => {
  assert.match(card('P02'), />PLACEHOLDER</);
  assert.doesNotMatch(card('P01'), />PLACEHOLDER</);
  assert.doesNotMatch(card('P03'), />PLACEHOLDER</);
});

test('the header shows the concept and content test; the ledger shows seat, model and tokens', () => {
  assert.match(html, /<h1>First Hire<\/h1>/);
  assert.match(html, /a Midwest design studio taking on its first hire/);
  assert.match(html, /<td>rival<\/td><td>claude-gpt-6-sol\[1m\]<\/td><td class="num">1,545<\/td>/);
  assert.match(html, /<td>render<\/td>/);
});
