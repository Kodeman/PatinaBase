#!/usr/bin/env node
// Done-oracle and renderer for one calm, photo-forward client-page direction.
// Usage: node check-direction.mjs <a|b|c> [--no-render]
// Reads direction-<x>/{index,pay,empty}.html and notes.md. In Chromium it measures the arrival
// screen (390x844 and 1440x900): visible words <= 40 and photographs covering >= 50% of the
// screen. It also checks no horizontal overflow at 390, 44px targets, captions, alt text, type
// floors, the long-paragraph limit, required fixture strings, banned words, and the notes
// sections. Unless --no-render, it writes direction-<x>/renders/*.png for the founders' deck.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const key = process.argv[2];
const render = !process.argv.includes('--no-render');
if (!['a', 'b', 'c'].includes(key)) { console.error('usage: check-direction.mjs <a|b|c> [--no-render]'); process.exit(2); }
const dir = join(toolsDir, '..', `direction-${key}`);
const PAGES = ['index', 'pay', 'empty'];
const errors = [];
const fail = (m) => errors.push(m);

// ---------- static ----------
for (const f of [...PAGES.map((p) => `${p}.html`), 'notes.md']) if (!existsSync(join(dir, f))) fail(`missing direction-${key}/${f}`);
if (errors.length) { report(); }
const html = Object.fromEntries(PAGES.map((p) => [p, readFileSync(join(dir, `${p}.html`), 'utf8')]));
const notes = readFileSync(join(dir, 'notes.md'), 'utf8');
const allHtml = Object.values(html).join('\n');

const BANNED = [/\bAI\b/, /artificial intelligence/i, /\bgenerated\b/i, /\bcurated\b/i, /\bluxury\b/i, /\bseamless/i, /\belevated\b/i, /\bbespoke\b/i, /\bstreak/i, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, /!\s*</];
for (const re of BANNED) {
  if (re.test(allHtml.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, ''))) fail(`banned pattern ${re} in a page`);
  if (re.source !== '!\\s*<' && re.test(notes.replace(/`[^`]*`/g, ''))) fail(`banned pattern ${re} in notes.md (quote it in backticks if you are naming a rule)`);
}
for (const s of ['Birchwood Studio', 'Prepared by Birchwood Studio · Sent through Patina', 'Elm Street House', 'Maren']) {
  if (!html.index.includes(s) && !html.index.includes(s.replace('·', '&middot;'))) fail(`index.html lacks "${s}"`);
}
if (!/\$600\.00/.test(html.index + html.pay)) fail('the past-due $600.00 is not reachable on index or pay');
if (!/\$7,480\.00/.test(html.index + html.pay)) fail('the sofa approval $7,480.00 is not on index or pay');
for (const h of ['## Concept', '## What it removes or moves', '## Spec rules this direction changes', '## How editions drive it', '## Zero-photo job', '## Risks']) {
  if (!notes.includes(h)) fail(`notes.md lacks the section "${h}"`);
}

// ---------- browser ----------
function loadPlaywright() {
  const bases = [join(toolsDir, '..', '..', '..')];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: toolsDir, encoding: 'utf8' }).trim();
    bases.push(dirname(common));
  } catch { /* not a checkout */ }
  for (const base of bases) for (const pkg of ['apps/client-portal', 'apps/designer-portal', '.']) {
    try { return createRequire(join(base, pkg, 'package.json')).resolve('@playwright/test'); } catch { /* next */ }
  }
  return null;
}

const measure = () => {
  const vw = innerWidth, vh = innerHeight;
  const out = { words: 0, imgArea: 0, small: [], tiny: [], longBlocks: [], badFigures: [], noAlt: [], overflow: document.documentElement.scrollWidth - vw };
  const visible = (el) => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  // words on the arrival screen
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const t = n.textContent.trim(); if (!t || !n.parentElement || !visible(n.parentElement)) continue;
    if (n.parentElement.closest('[aria-hidden="true"],[hidden],dialog:not([open])')) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const rects = [...r.getClientRects()].filter((b) => b.width > 0 && b.bottom > 0 && b.top < vh && b.right > 0 && b.left < vw);
    if (rects.length) out.words += t.split(/\s+/).filter((w) => /[\p{L}\p{N}$]/u.test(w)).length;
  }
  // photograph coverage on the arrival screen (img, picture, or [data-photo] backgrounds)
  for (const el of document.querySelectorAll('img,[data-photo]')) {
    if (!visible(el)) continue;
    const b = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(b.right, vw) - Math.max(b.left, 0)), h = Math.max(0, Math.min(b.bottom, vh) - Math.max(b.top, 0));
    out.imgArea += w * h;
  }
  out.imgShare = Math.min(1, out.imgArea / (vw * vh));
  // whole page
  for (const el of document.querySelectorAll('a[href],button,summary,input,select,[role="button"]')) {
    if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
    if (el.matches('a') && el.closest('p,figcaption,li') && getComputedStyle(el).display === 'inline') continue;
    const b = el.getBoundingClientRect(); if (!b.width) continue;
    if (b.width < 44 || b.height < 44) out.small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
  }
  for (const el of document.querySelectorAll('p,li,dd,td')) {
    if (!visible(el) || !el.textContent.trim()) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16 && !el.closest('figcaption,[data-eyebrow],[data-caption]')) out.tiny.push(`${el.tagName.toLowerCase()} ${fs}px "${el.textContent.trim().slice(0, 30)}"`);
    const words = el.textContent.trim().split(/\s+/).length;
    if (words > 60 && !el.closest('[data-letter]')) out.longBlocks.push(`${words} words: "${el.textContent.trim().slice(0, 40)}"`);
  }
  for (const el of document.querySelectorAll('figcaption,[data-caption],[data-eyebrow]')) {
    if (!visible(el) || !el.textContent.trim()) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) out.tiny.push(`caption/eyebrow ${fs}px "${el.textContent.trim().slice(0, 30)}"`);
  }
  for (const img of document.querySelectorAll('img')) {
    if (img.getAttribute('alt') === null || (img.getAttribute('alt') === '' && !img.closest('[aria-hidden="true"]'))) out.noAlt.push(img.getAttribute('src'));
    const fig = img.closest('figure');
    if (!fig) { out.badFigures.push(`${img.getAttribute('src')}: not in a figure`); continue; }
    const cap = fig.querySelector('figcaption');
    const first = cap ? (cap.querySelector('[data-triplet]') ?? cap).textContent.split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? '' : '';
    if (!cap) out.badFigures.push(`${img.getAttribute('src')}: no figcaption`);
    else if (first.split('·').filter((s) => s.trim()).length !== 3) out.badFigures.push(`${img.getAttribute('src')}: caption "${first.slice(0, 60)}" is not what · whose · when`);
    else if (/placeholder|inputs\/photos/.test(img.getAttribute('src') ?? '') && !/placeholder/i.test(cap.textContent)) out.badFigures.push(`${img.getAttribute('src')}: placeholder photo not labelled "Placeholder"`);
  }
  return out;
};

const p = loadPlaywright();
if (!p) { fail('@playwright/test not found'); report(); }
const mod = await import(pathToFileURL(p).href);
const browser = await (mod.chromium ?? mod.default.chromium).launch();
const shots = join(dir, 'renders');
if (render) mkdirSync(shots, { recursive: true });
const VIEWS = { phone: { width: 390, height: 844, deviceScaleFactor: 2 }, desktop: { width: 1440, height: 900, deviceScaleFactor: 1 } };
const results = {};
try {
  for (const page of PAGES) for (const [vname, vp] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, reducedMotion: 'reduce' });
    const tab = await ctx.newPage();
    await tab.goto(pathToFileURL(join(dir, `${page}.html`)).href, { waitUntil: 'load', timeout: 30000 });
    await tab.evaluate(() => document.fonts?.ready);
    await tab.waitForTimeout(300);
    const m = await tab.evaluate(measure);
    results[`${page}@${vname}`] = { words: m.words, imgShare: +m.imgShare.toFixed(2) };
    const at = `${page}.html @${vp.width}`;
    if (page === 'index') {
      if (m.words > 40) fail(`${at}: ${m.words} words on the arrival screen (budget 40)`);
      if (m.imgShare < 0.5) fail(`${at}: photographs cover ${(m.imgShare * 100).toFixed(0)}% of the arrival screen (floor 50%)`);
    }
    if (vname === 'phone' && m.overflow > 0) fail(`${at}: horizontal overflow ${m.overflow}px`);
    for (const s of m.small) fail(`${at}: target under 44px: ${s}`);
    for (const s of m.tiny) fail(`${at}: text under its floor: ${s}`);
    for (const s of m.longBlocks) fail(`${at}: paragraph over 60 words: ${s}`);
    for (const s of m.badFigures) fail(`${at}: ${s}`);
    for (const s of m.noAlt) fail(`${at}: img without alt: ${s}`);
    if (render) {
      if (page === 'index') {
        await tab.screenshot({ path: join(shots, `${vname}-fold.png`) });
        await tab.screenshot({ path: join(shots, `${vname}-full.png`), fullPage: true });
      } else await tab.screenshot({ path: join(shots, `${vname}-${page}.png`), fullPage: page === 'empty' });
    }
    await ctx.close();
  }
} finally { await browser.close(); }
report();

function report() {
  console.log(JSON.stringify({ direction: key, results, errors }, null, 2));
  console.log(errors.length ? `FAIL: ${errors.length} problem(s)` : 'PASS');
  process.exit(errors.length ? 1 : 0);
}
