#!/usr/bin/env node
/**
 * board.mjs <runDir>
 *
 * Writes <runDir>/board.html: one self-contained review page (< 16 MB). A header with the concept
 * and content test, then one card per piece: the rendered preview (downscaled to <= 1200 px JPEG
 * with sips on macOS, else with Playwright chromium, and inlined), the final copy, the rival draft,
 * lint results ("Not linted yet" vs "Lint crashed"), the piece's own `## Pnn` section of review.md, a
 * PLACEHOLDER badge when any image on the piece is a FLUX placeholder and a MISSING badge when a
 * job has no image at all. Videos show a poster frame plus the local mp4 path. A ledger table
 * closes the page. The only external requests are Google Fonts. A board of 16 MB or more is not
 * written (exit 1).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runPaths, readPlan, readFinal } from './lib/run.mjs';
import { escapeHtml as esc, leadJob, pickImage } from './compose.mjs';

const MAX_BYTES = 16 * 1024 * 1024;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function readJson(file, fallback) {
  const text = readText(file);
  if (text == null) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function listImages(dir) {
  try {
    return fs.readdirSync(dir).filter((n) => IMAGE_EXT.test(n)).sort().map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

/** The preview for a piece: out/<P>/<P>.png, else <P>-preview.png, else any image in out/<P>/. */
function previewFile(paths, piece) {
  const outDir = path.join(paths.out, piece.id);
  const named = [`${piece.id}.png`, `${piece.id}-preview.png`].map((n) => path.join(outDir, n));
  const found = named.find((f) => fs.existsSync(f)) || listImages(outDir)[0];
  if (found) return found;
  // A video has no still render: its poster frame is the composition's first image asset.
  if (piece.kind === 'video') {
    const composeDir = path.join(paths.compose, piece.id);
    return listImages(path.join(composeDir, 'assets'))[0] || listImages(composeDir)[0] || null;
  }
  return null;
}

let tmpDir = null;
let browser = null;

/** Without sips: draw the image at <= 1200 px on its long edge in chromium and screenshot a JPEG. */
async function downscaleWithBrowser(file, mime) {
  if (!browser) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
  }
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    await page.setContent(`<body style="margin:0"><img id="i" style="display:block" src="data:${mime};base64,${fs.readFileSync(file).toString('base64')}"></body>`);
    const size = await page.$eval('#i', async (img, max) => {
      await img.decode();
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * k));
      const height = Math.max(1, Math.round(img.naturalHeight * k));
      img.style.width = `${width}px`;
      img.style.height = `${height}px`;
      return { width, height };
    }, 1200);
    await page.setViewportSize(size);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 85, clip: { x: 0, y: 0, ...size } });
    return `data:image/jpeg;base64,${jpg.toString('base64')}`;
  } finally {
    await page.close();
  }
}

async function inlineImage(file) {
  if (!tmpDir) tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-board-'));
  const jpg = path.join(tmpDir, `${path.basename(file).replace(/\W+/g, '-')}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  const sips = spawnSync('sips', ['-Z', '1200', '-s', 'format', 'jpeg', file, '--out', jpg], { encoding: 'utf8' });
  if (sips.status === 0 && fs.existsSync(jpg)) {
    return `data:image/jpeg;base64,${fs.readFileSync(jpg).toString('base64')}`;
  }
  const mime = MIME[path.extname(file).toLowerCase()] || 'image/png';
  try {
    return await downscaleWithBrowser(file, mime);
  } catch (err) {
    // Last resort: the raw file. main() still refuses a board of 16 MB or more.
    console.error(`board.mjs: could not downscale ${file} (${err.message.split('\n')[0]}); inlining it as is`);
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  }
}

/** Every job id a piece's copy or plan points at. */
function jobsFor(piece, data) {
  const ids = new Set(Array.isArray(piece.visuals) ? piece.visuals : []);
  const lead = leadJob(piece, data);
  if (lead) ids.add(lead);
  for (const list of [data?.slides, data?.scenes]) {
    for (const item of Array.isArray(list) ? list : []) if (item?.visual) ids.add(item.visual);
  }
  return [...ids];
}

/** True when an image the piece uses is a FLUX placeholder (assets.json source or a flux/ path). */
function usesPlaceholder(runDir, jobIds, assets, picks) {
  const fluxRoot = runPaths(runDir).flux + path.sep;
  return jobIds.some((j) => {
    const asset = assets?.[j];
    const pick = picks?.[j];
    const file = pick || asset?.files?.[0];
    if (typeof file === 'string' && path.resolve(runDir, file).startsWith(fluxRoot)) return true;
    if (asset?.source !== 'flux-placeholder') return false;
    return !pick || (asset.files || []).includes(pick);
  });
}

/** Jobs with no usable image: no existing picked file and no existing assets.json file. */
function missingJobs(runDir, jobIds) {
  return jobIds.filter((j) => !pickImage(runDir, j));
}

function finalData(runDir, pieceId) {
  try {
    return readFinal(runDir, pieceId).data;
  } catch {
    return {};
  }
}

/**
 * The body lines of the review.md sections whose `## ` heading starts with the piece id
 * (`## P01 — ...`, `## P01: ...`, `## P01 ...`). A mention of the id anywhere else, a preamble or
 * a `## Cross-piece notes` section never attributes text to the piece.
 */
function reviewFor(review, pieceId) {
  if (!review) return [];
  const own = new RegExp(`^##\\s+${pieceId}(?:[\\s:]|$)`);
  const lines = [];
  let inside = false;
  for (const line of review.split(/\r?\n/)) {
    if (/^##\s/.test(line)) inside = own.test(line);
    else if (inside) lines.push(line);
  }
  return lines;
}

/** Table cells of a markdown row, honouring `\|` escapes. */
function tableCells(line) {
  return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** A piece's review section as escaped HTML: paragraphs, list items and markdown tables. */
function reviewHtml(lines) {
  const out = [];
  const blocks = lines.join('\n').split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b && !/^-{3,}$/.test(b));
  for (const block of blocks) {
    const rows = block.split('\n');
    if (rows.every((r) => r.trim().startsWith('|'))) {
      const body = rows.filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r)).map(tableCells);
      const [head, ...rest] = /^\s*\|?[\s:|-]+\|?\s*$/.test(rows[1] || '') ? body : [null, ...body];
      out.push(`<div class="scroll"><table class="review">${head ? `<thead><tr>${head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else {
      out.push(`<p class="finding">${esc(block.replace(/\s*\n\s*/g, ' '))}</p>`);
    }
  }
  return out.join('');
}

/**
 * critique/lint-<P>.json as {state}: 'missing' (never linted), 'crashed' (empty, not JSON, or
 * voice-lint's fatal shape {fatal, errors:[{rule:'lint-crashed'}]}), or 'ok' with the result.
 */
function readLint(file) {
  const text = readText(file);
  if (text == null) return { state: 'missing' };
  let lint;
  try {
    lint = JSON.parse(text);
  } catch {
    return { state: 'crashed', detail: text.trim() ? 'the lint file is not valid JSON' : 'the lint file is empty' };
  }
  if (!lint || typeof lint !== 'object') return { state: 'crashed', detail: 'the lint file holds no result' };
  const crashed = (Array.isArray(lint.errors) ? lint.errors : []).find((e) => e?.rule === 'lint-crashed');
  if (lint.fatal || crashed) {
    const detail = typeof lint.fatal === 'string' ? lint.fatal : crashed?.match || 'voice-lint stopped before it finished';
    return { state: 'crashed', detail };
  }
  return { state: 'ok', lint };
}

function lintBlock(result) {
  if (result.state === 'missing') return '<p class="muted">Not linted yet.</p>';
  if (result.state === 'crashed') {
    return `<p class="lint-sum">Lint crashed</p><p class="muted">${esc(result.detail)}. Treat this piece as not linted and rerun voice-lint.</p>`;
  }
  const { lint } = result;
  const errors = Array.isArray(lint.errors) ? lint.errors : [];
  const warnings = Array.isArray(lint.warnings) ? lint.warnings : [];
  const row = (kind, f) => `<li><span class="lint-kind">${kind}</span> <code>${esc(f.rule)}</code> ${f.match ? `“${esc(f.match)}”` : ''}${f.line ? ` <span class="muted">line ${esc(f.line)}</span>` : ''}</li>`;
  const summary = `<p class="lint-sum">${errors.length} error${errors.length === 1 ? '' : 's'} · ${warnings.length} warning${warnings.length === 1 ? '' : 's'}</p>`;
  if (!errors.length && !warnings.length) return summary;
  return `${summary}<ul class="lint">${errors.map((f) => row('error', f)).join('')}${warnings.map((f) => row('warn', f)).join('')}</ul>`;
}

function tokensOf(entry) {
  if (typeof entry.tokens === 'number') return entry.tokens;
  const t = entry.tokens || entry.usage;
  if (t && typeof t === 'object') {
    const keys = ['input', 'output', 'input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];
    const sum = keys.reduce((n, k) => n + (Number(t[k]) || 0), 0);
    return sum || null;
  }
  return null;
}

async function pieceCard(runDir, plan, piece, ctx) {
  const paths = runPaths(runDir);
  const finalText = readText(path.join(paths.copy, `${piece.id}.final.md`));
  const rival = readText(path.join(paths.copy, `${piece.id}.sol.md`));
  const lint = readLint(path.join(paths.critique, `lint-${piece.id}.json`));
  const jobs = jobsFor(piece, finalData(runDir, piece.id));
  const placeholder = usesPlaceholder(runDir, jobs, ctx.assets, ctx.picks);
  const missing = missingJobs(runDir, jobs);
  const preview = previewFile(paths, piece);
  const findings = reviewHtml(reviewFor(ctx.review, piece.id));

  let media = '<div class="preview empty"><span>No render yet</span></div>';
  if (piece.kind === 'pr-pitch') {
    const pitch = readText(path.join(paths.out, piece.id, 'pitch.md')) || readText(path.join(paths.compose, piece.id, 'pitch.md'));
    media = pitch ? `<pre class="preview pitch">${esc(pitch)}</pre>` : media;
  } else if (preview) {
    media = `<img class="preview" src="${await inlineImage(preview)}" alt="Rendered preview of ${esc(piece.id)}">`;
  }
  const mp4 = path.join(paths.out, piece.id, `${piece.id}.mp4`);
  const videoNote = piece.kind === 'video'
    ? `<p class="path">${fs.existsSync(mp4) ? `Video: <code>${esc(mp4)}</code>` : 'Video not rendered. See the ledger for the reason.'}</p>`
    : '';

  const assetSources = jobs.map((j) => `${j}: ${ctx.picks?.[j] ? 'picked' : ctx.assets?.[j]?.source || 'missing'}`).join(' · ');

  return `
<article class="card" id="${esc(piece.id)}">
  <header class="card-head">
    <p class="eyebrow">${esc(piece.id)} · ${esc(piece.kind)} · ${esc(piece.channel)}</p>
    <h2>${esc(piece.angle || piece.id)}</h2>
    ${placeholder ? '<p class="tag" title="A FLUX placeholder image: never final, never approved">PLACEHOLDER</p>' : ''}
    ${missing.length ? `<p class="tag" title="No image for ${esc(missing.join(', '))}: never final, never approved">MISSING</p>` : ''}
  </header>
  <div class="card-body">
    <figure class="media">${media}${videoNote}${assetSources ? `<figcaption>${esc(assetSources)}</figcaption>` : ''}</figure>
    <div class="copy">
      <h3>Final copy</h3>
      ${finalText ? `<pre class="final">${esc(finalText)}</pre>` : '<p class="muted">No final copy yet.</p>'}
      <details><summary>Rival draft (Sol)</summary>${rival ? `<pre class="final">${esc(rival)}</pre>` : '<p class="muted">No rival draft.</p>'}</details>
      <h3>Lint</h3>
      ${lintBlock(lint)}
      ${findings ? `<h3>Review</h3><div class="findings">${findings}</div>` : ''}
    </div>
  </div>
</article>`;
}

function ledgerTable(ledger) {
  if (!ledger.length) return '<p class="muted">The ledger is empty.</p>';
  let total = 0;
  const rows = ledger.map((e) => {
    const tokens = tokensOf(e);
    if (tokens) total += tokens;
    return `<tr><td>${esc(e.piece || '')}</td><td>${esc(e.step || '')}</td><td>${esc(e.seat || '')}</td><td>${esc(e.model || '')}</td><td class="num">${tokens == null ? '' : tokens.toLocaleString('en-US')}</td><td>${esc(e.status || '')}${e.output || e.reason ? ` <span class="muted">${esc(e.output || e.reason)}</span>` : ''}</td></tr>`;
  });
  return `<div class="scroll"><table class="ledger">
<thead><tr><th>Piece</th><th>Step</th><th>Seat</th><th>Model</th><th class="num">Tokens</th><th>Status</th></tr></thead>
<tbody>${rows.join('\n')}</tbody>
<tfoot><tr><td colspan="4">Total</td><td class="num">${total.toLocaleString('en-US')}</td><td></td></tr></tfoot>
</table></div>`;
}

const STYLE = `
:root{
  --paper:#EDE9E4; --paper-raised:#F5F2ED; --ink:#3F3B37; --ink-body:#4A453F; --ink-soft:#655B52;
  --ink-faint:#8A7D6C; --clay:#A3927C; --hairline:#B8B0A6;
  --font-display:'Playfair Display', Georgia, 'Times New Roman', serif;
  --font-body:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  --font-mono:'DM Mono', 'SF Mono', Menlo, monospace;
  color-scheme:light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#2B2825; --paper-raised:#34302C; --ink:#EDE9E4; --ink-body:#E0DAD2; --ink-soft:#B8B0A6;
    --ink-faint:#A3927C; --clay:#A3927C; --hairline:#4A453F; color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --paper:#2B2825; --paper-raised:#34302C; --ink:#EDE9E4; --ink-body:#E0DAD2; --ink-soft:#B8B0A6;
  --ink-faint:#A3927C; --clay:#A3927C; --hairline:#4A453F; color-scheme:dark;
}
*{ box-sizing:border-box; }
html{ -webkit-text-size-adjust:100%; }
body{ margin:0; background:var(--paper); color:var(--ink-body); font-family:var(--font-body); font-size:16px; line-height:1.55; }
main{ max-width:1180px; margin:0 auto; padding:48px 16px 80px; }
h1,h2,h3{ font-family:var(--font-display); font-weight:400; color:var(--ink); margin:0; text-wrap:balance; }
h1{ font-size:clamp(2rem, 5vw, 3.2rem); line-height:1.1; }
h2{ font-size:1.6rem; line-height:1.2; }
h3{ font-family:var(--font-mono); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.14em; color:var(--ink-faint); margin:1.4rem 0 0.5rem; font-weight:400; }
p{ margin:0 0 0.8em; }
code, .path{ font-family:var(--font-mono); font-size:0.85em; overflow-wrap:anywhere; }
.eyebrow{ font-family:var(--font-mono); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.16em; color:var(--ink-faint); margin:0 0 0.6rem; }
.muted{ color:var(--ink-faint); }
.lede{ font-family:var(--font-display); font-style:italic; font-size:1.25rem; color:var(--ink-soft); max-width:60ch; margin-top:0.8rem; }
.masthead{ padding-bottom:2rem; }
.facts{ display:grid; grid-template-columns:max-content 1fr; gap:0.35rem 1.4rem; margin:1.4rem 0 0; }
.facts dt{ font-family:var(--font-mono); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink-faint); padding-top:0.2rem; }
.facts dd{ margin:0; }
@media (max-width:640px){ .facts{ grid-template-columns:1fr; } .facts dd{ margin-bottom:0.6rem; } }
.toc{ display:flex; flex-wrap:wrap; gap:0.4rem 1.2rem; font-family:var(--font-mono); font-size:0.8rem; margin-top:1.4rem; }
.toc a{ color:var(--ink-soft); }
.card{ border-top:1px solid var(--hairline); padding:2rem 0; }
.card-head{ display:flex; flex-wrap:wrap; align-items:baseline; gap:0.4rem 1rem; margin-bottom:1.2rem; }
.card-head .eyebrow{ flex-basis:100%; margin:0; }
.tag{ font-family:var(--font-mono); font-size:0.72rem; letter-spacing:0.14em; color:var(--ink); border:1px solid var(--ink); padding:0.1rem 0.5rem; margin:0; }
.card-body{ display:grid; grid-template-columns:minmax(0, 5fr) minmax(0, 6fr); gap:2rem; align-items:start; }
@media (max-width:820px){ .card-body{ grid-template-columns:minmax(0, 1fr); } }
.media{ margin:0; }
.preview{ display:block; max-width:100%; height:auto; border:1px solid var(--hairline); background:var(--paper-raised); }
.preview.empty{ aspect-ratio:4/5; display:flex; align-items:center; justify-content:center; font-family:var(--font-mono); font-size:0.8rem; color:var(--ink-faint); }
.preview.pitch{ padding:1rem; }
figcaption{ font-family:var(--font-mono); font-size:0.72rem; color:var(--ink-faint); margin-top:0.5rem; }
pre{ white-space:pre-wrap; overflow-wrap:anywhere; font-family:var(--font-mono); font-size:0.82rem; line-height:1.6; margin:0; }
.final{ background:var(--paper-raised); border:1px solid var(--hairline); padding:0.9rem 1rem; color:var(--ink-body); }
details{ margin-top:0.8rem; }
summary{ cursor:pointer; font-family:var(--font-mono); font-size:0.8rem; color:var(--ink-soft); }
details pre{ margin-top:0.6rem; }
ul.lint{ margin:0; padding-left:1.1rem; }
ul.lint li{ margin-bottom:0.3rem; white-space:pre-wrap; }
.findings p{ overflow-wrap:anywhere; }
table.review{ border-collapse:collapse; width:100%; font-size:0.85rem; margin:0 0 0.8em; }
.review th, .review td{ text-align:left; padding:0.35rem 0.7rem 0.35rem 0; border-bottom:1px solid var(--hairline); vertical-align:top; }
.review th{ font-family:var(--font-mono); font-weight:400; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--ink-faint); }
.lint-kind{ font-family:var(--font-mono); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--ink-faint); }
.lint-sum{ font-family:var(--font-mono); font-size:0.85rem; }
.scroll{ overflow-x:auto; }
table.ledger{ border-collapse:collapse; width:100%; font-size:0.88rem; }
.ledger th, .ledger td{ text-align:left; padding:0.45rem 0.9rem 0.45rem 0; border-bottom:1px solid var(--hairline); vertical-align:top; }
.ledger th{ font-family:var(--font-mono); font-weight:400; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--ink-faint); }
.ledger .num{ text-align:right; font-variant-numeric:tabular-nums; }
.ledger tfoot td{ border-bottom:none; font-weight:500; }
.section-title{ margin:2.4rem 0 1rem; }
:focus-visible{ outline:2px solid var(--ink-soft); outline-offset:2px; }
`;

export async function buildBoard(runDir) {
  const paths = runPaths(runDir);
  const plan = readPlan(runDir);
  const ctx = {
    assets: readJson(path.join(paths.mj, 'assets.json'), {}),
    picks: readJson(path.join(paths.mj, 'picks.json'), {}),
    review: readText(path.join(paths.critique, 'review.md')),
  };
  const ledger = readJson(paths.ledger, []);
  const ct = plan.contentTest || {};
  const concept = plan.concept || {};
  const pieces = plan.pieces || [];

  const facts = [
    ['Content test', ct.pass === true ? 'pass' : ct.pass === false ? 'did not pass' : 'not run'],
    ['Audience', ct.audience], ['Moment', ct.moment], ['Stream', ct.stream], ['Promise', ct.promise], ['Reason', ct.reason],
    ['Art direction', concept.artDirection],
  ].filter(([, v]) => v);

  const cards = [];
  try {
    for (const p of pieces) cards.push(await pieceCard(runDir, plan, p, ctx));
  } finally {
    if (browser) await browser.close();
    browser = null;
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Press review board</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,400&family=Inter:wght@400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<main>
<header class="masthead">
  <p class="eyebrow">The Press · ${esc(plan.runId || path.basename(runDir))}</p>
  <h1>${esc(concept.name || 'Untitled concept')}</h1>
  ${concept.idea ? `<p class="lede">${esc(concept.idea)}</p>` : ''}
  <dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  ${ctx.review ? `<details><summary>Full review (critique/review.md)</summary><pre class="final">${esc(ctx.review)}</pre></details>` : ''}
  <nav class="toc" aria-label="Pieces">${pieces.map((p) => `<a href="#${esc(p.id)}">${esc(p.id)} ${esc(p.kind)}</a>`).join('')}</nav>
</header>
${cards.join('\n')}
<h2 class="section-title">Ledger</h2>
${ledgerTable(Array.isArray(ledger) ? ledger : [])}
</main>
</body>
</html>
`;
}

async function main() {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('usage: node marketing/tools/board.mjs <runDir>');
    process.exit(2);
  }
  const root = path.resolve(runDir);
  const html = await buildBoard(root);
  const file = runPaths(root).board;
  const bytes = Buffer.byteLength(html);
  if (bytes >= MAX_BYTES) {
    // Never leave an oversize board (or the previous run's board) on disk to be published.
    fs.rmSync(file, { force: true });
    console.error(`board.mjs: the board would be ${(bytes / 1024 / 1024).toFixed(2)} MB (16 MB or more); not written, it would not publish as an artifact.`);
    process.exit(1);
  }
  fs.writeFileSync(file, html);
  console.log(`wrote ${file} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(`board.mjs: ${err.message}`);
    process.exit(1);
  });
}
