#!/usr/bin/env node
/**
 * render.mjs <runDir> [--piece P]
 *
 * Renders compose/<P>/ into out/<P>/ at the channels.json spec with Playwright chromium
 * (deviceScaleFactor 1). Every output, skip and failure gets a ledger.json entry.
 *
 *   social, pin      <P>.png at the exact pixel size
 *   one-pager, poster <P>.pdf at the inch size (poster 18x24 in) + <P>-preview.png at 96 dpi
 *   email            <P>.html copy (+ its image) + <P>.png, a 600 px wide full-page preview
 *   pr-pitch         pitch.md copy
 *   deck             <P>.html single file (relative images inlined) + <P>.pdf, one 1920x1080 page
 *                    per slide + <P>.png of the first slide; skipped until an agent composes it
 *   video            npx --no-install hyperframes@0.8.142 render -> <P>.mp4, else skipped with the reason
 *
 * Network: only file:, data: and Google Fonts requests are allowed; everything else is aborted.
 * Fonts that fail to load (offline) fall back to the system serif/sans.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { REPO_ROOT, CHANNELS, runPaths, readPlan, appendLedger } from './lib/run.mjs';
import { parseArgs, selectPieces } from './compose.mjs';

const CSS_PX_PER_IN = 96;
const ALLOWED_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };

async function openPage(browser, viewport, file) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'file:' || url.protocol === 'data:' || ALLOWED_HOSTS.has(url.hostname)) return route.continue();
    return route.abort();
  });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))])).catch(() => {});
  return { page, close: () => context.close() };
}

/** Inline every relative src="..." (img, video, source) as a data: URI so the page is one file. */
function inlineRelativeMedia(html, baseDir) {
  return html.replace(/(\ssrc=")([^"]+)(")/g, (match, pre, src, post) => {
    if (/^(?:[a-z]+:|\/\/|#)/i.test(src)) return match;
    const file = path.resolve(baseDir, src);
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime || !fs.existsSync(file)) return match;
    return `${pre}data:${mime};base64,${fs.readFileSync(file).toString('base64')}${post}`;
  });
}

// The same pinned CLI the compose workflow lints with; --no-install never fetches it mid-run.
const HYPERFRAMES = 'hyperframes@0.8.142';

function hyperframesAvailable() {
  const probe = spawnSync('npx', ['--no-install', HYPERFRAMES, '--version'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60000 });
  return probe.status === 0;
}

async function renderPiece(browser, runDir, piece, record) {
  const paths = runPaths(runDir);
  const composeDir = path.join(paths.compose, piece.id);
  const outDir = path.join(paths.out, piece.id);
  const index = path.join(composeDir, 'index.html');
  const channel = CHANNELS[piece.channel] || {};
  const out = (name) => path.join(outDir, name);
  const ok = (file, extra = {}) => record({ status: 'ok', output: path.relative(runDir, file), ...extra });
  const skip = (reason) => record({ status: 'skipped', reason });

  if (piece.kind === 'video') {
    if (!fs.existsSync(index)) return skip(`compose/${piece.id}/index.html is missing; video is composed by an agent from marketing/templates/video/`);
    if (!hyperframesAvailable()) return skip(`hyperframes CLI is not installed (npx --no-install ${HYPERFRAMES} failed)`);
    fs.mkdirSync(outDir, { recursive: true });
    const file = out(`${piece.id}.mp4`);
    const run = spawnSync('npx', ['--no-install', HYPERFRAMES, 'render', composeDir, '--output', file], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 15 * 60 * 1000,
    });
    if (run.status === 0 && fs.existsSync(file)) return ok(file, { format: 'mp4' });
    return record({ status: 'failed', reason: `hyperframes render exited ${run.status}: ${(run.stderr || run.stdout || '').trim().slice(-400)}` });
  }

  if (piece.kind === 'deck') {
    if (!fs.existsSync(index)) return skip(`compose/${piece.id}/index.html is missing; deck is composed by an agent from marketing/templates/deck/`);
    fs.mkdirSync(outDir, { recursive: true });
    const single = out(`${piece.id}.html`);
    fs.writeFileSync(single, inlineRelativeMedia(fs.readFileSync(index, 'utf8'), composeDir));
    ok(single, { format: 'html' });
    const { page, close } = await openPage(browser, { width: channel.width || 1920, height: channel.height || 1080 }, single);
    try {
      const png = out(`${piece.id}.png`);
      // The cover slide as the deck's preview, without the on-screen navigation.
      await page.addStyleTag({ content: '.nav-ui, .clickzone { display: none !important; }' });
      await page.screenshot({ path: png });
      ok(png, { format: 'png' });
      const pdf = out(`${piece.id}.pdf`);
      await page.pdf({ path: pdf, width: `${channel.width || 1920}px`, height: `${channel.height || 1080}px`, printBackground: true });
      ok(pdf, { format: 'pdf' });
    } finally {
      await close();
    }
    return;
  }

  if (piece.kind === 'pr-pitch') {
    const src = path.join(composeDir, 'pitch.md');
    if (!fs.existsSync(src)) return skip(`compose/${piece.id}/pitch.md is missing; run compose.mjs first`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(src, out('pitch.md'));
    return ok(out('pitch.md'), { format: 'md' });
  }

  if (!fs.existsSync(index)) return skip(`compose/${piece.id}/index.html is missing; run compose.mjs first`);
  fs.mkdirSync(outDir, { recursive: true });

  if (piece.kind === 'email') {
    const html = out(`${piece.id}.html`);
    fs.copyFileSync(index, html);
    for (const name of fs.readdirSync(composeDir)) {
      const src = path.join(composeDir, name);
      if (name !== 'index.html' && fs.statSync(src).isFile()) fs.copyFileSync(src, out(name));
    }
    ok(html, { format: 'html' });
    // A short viewport, so the full-page screenshot is exactly as tall as the email.
    const { page, close } = await openPage(browser, { width: channel.width || 600, height: 100 }, html);
    try {
      const png = out(`${piece.id}.png`);
      await page.screenshot({ path: png, fullPage: true });
      ok(png, { format: 'png' });
    } finally {
      await close();
    }
    return;
  }

  if (channel.unit === 'in') {
    const viewport = { width: Math.round(channel.width * CSS_PX_PER_IN), height: Math.round(channel.height * CSS_PX_PER_IN) };
    const { page, close } = await openPage(browser, viewport, index);
    try {
      const pdf = out(`${piece.id}.pdf`);
      await page.pdf({ path: pdf, width: `${channel.width}in`, height: `${channel.height}in`, printBackground: true });
      ok(pdf, { format: 'pdf' });
      const png = out(`${piece.id}-preview.png`);
      await page.screenshot({ path: png });
      ok(png, { format: 'png', preview: true });
    } finally {
      await close();
    }
    return;
  }

  const { page, close } = await openPage(browser, { width: channel.width, height: channel.height }, index);
  try {
    const png = out(`${piece.id}.png`);
    await page.screenshot({ path: png });
    ok(png, { format: 'png' });
  } finally {
    await close();
  }
}

async function main() {
  const { runDir, piece } = parseArgs(process.argv.slice(2));
  if (!runDir) {
    console.error('usage: node marketing/tools/render.mjs <runDir> [--piece P]');
    process.exit(2);
  }
  const root = path.resolve(runDir);
  const pieces = selectPieces(readPlan(root), piece);
  let failed = 0;
  const browser = await chromium.launch();
  try {
    for (const p of pieces) {
      const record = (entry) => {
        const full = { piece: p.id, step: 'render', kind: p.kind, ...entry };
        appendLedger(root, full);
        if (entry.status === 'failed') failed += 1;
        console.log(`${p.id} (${p.kind}): ${entry.status}${entry.output ? ` ${entry.output}` : ''}${entry.reason ? ` (${entry.reason})` : ''}`);
      };
      try {
        await renderPiece(browser, root, p, record);
      } catch (err) {
        record({ status: 'failed', reason: err.message });
      }
    }
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`render.mjs: ${err.message}`);
  process.exit(1);
});
