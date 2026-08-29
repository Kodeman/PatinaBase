/* MR2 claims probe — SECOND PASS ONLY. Prober-owned; not part of the C.8 instrument.
   Re-tests the builder v2's fixed / narrowed / dropped list on its merits.
   Writes to review-shots/claims-log.txt and review-shots/c-*.png. */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'review-shots');
const URL_ = 'file://' + path.join(here, 'index.html');
const L = [];
const say = s => { console.log(s); L.push(s); };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1560, height: 1000 }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(URL_);
await p.waitForFunction(() => window.__mockReady === true, { timeout: 20000 });
await p.evaluate(() => window.__lensSettled && window.__lensSettled());
await p.waitForTimeout(400);

/* ---------- RF-01: catalog crops ---------- */
say('\n--- RF-01 catalog crops ---');
const crops = await p.evaluate(() => {
  const out = { real: [], placeholders: 0, sizes: {}, distinctSrc: new Set() };
  document.querySelectorAll('#frame-1440 .ffe-row, #frame-1440 [class*="line"]').forEach(() => {});
  const all = [...document.querySelectorAll('#frame-1440 *')];
  all.forEach(el => {
    const cs = getComputedStyle(el);
    const bi = cs.backgroundImage || '';
    const cls = el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '');
    if (/thumb|crop/i.test(cls)) {
      const r = el.getBoundingClientRect();
      const key = Math.round(r.width) + 'x' + Math.round(r.height);
      out.sizes[key] = (out.sizes[key] || 0) + 1;
      if (bi.includes('data:image/jpeg')) { out.real.push(cls + ' ' + key); out.distinctSrc.add(bi.slice(0, 80)); }
      else out.placeholders++;
    }
  });
  out.distinctSrc = out.distinctSrc.size;
  return out;
});
say('  real crops: ' + crops.real.length + ' -> ' + JSON.stringify(crops.real.slice(0, 12)));
say('  distinct jpeg sources: ' + crops.distinctSrc + ' | placeholder thumbs: ' + crops.placeholders + ' | sizes: ' + JSON.stringify(crops.sizes));

/* ---------- RF-02 / R-10: rail segment names at s0 ---------- */
say('\n--- RF-02 / R-10 rail at scroll 0 ---');
await p.evaluate(() => { document.querySelector('#frame-1440').scrollTop = 0; });
await p.evaluate(() => window.__lensSettled && window.__lensSettled());
await p.waitForTimeout(500);
const rail0 = await p.evaluate(() => {
  const rail = document.querySelector('#rail-1440');
  const segs = [...rail.querySelectorAll('.seg')].map(s => ({
    region: s.getAttribute('data-target') || s.getAttribute('data-region') || s.dataset.go || '?',
    headInFrame: s.querySelector('.seg-name') ? s.querySelector('.seg-name').getAttribute('data-region-head-in-frame') : null,
    name: (s.querySelector('.seg-name') || {}).textContent ? s.querySelector('.seg-name').textContent.trim() : '',
    nameVisible: (() => { const n = s.querySelector('.seg-name'); if (!n) return null; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden' && getComputedStyle(n).opacity !== '0'; })(),
    nameColor: (() => { const n = s.querySelector('.seg-name'); return n ? getComputedStyle(n).color : null; })(),
    slot: (s.querySelector('.seg-slot') || {}).textContent ? s.querySelector('.seg-slot').textContent.trim() : '',
    text: s.textContent.replace(/\s+/g, ' ').trim()
  }));
  const head = rail.querySelector('.rail-head-btn');
  return { segs, headText: head ? head.textContent.replace(/\s+/g, ' ').trim() : null, blankSegs: segs.filter(s => s.text === '').length };
});
rail0.segs.forEach((s, i) => say('  seg ' + i + ' region=' + s.region + ' headInFrame=' + s.headInFrame + ' name="' + s.name + '" visible=' + s.nameVisible + ' color=' + s.nameColor + ' slot="' + s.slot + '"'));
say('  rail head text: "' + rail0.headText + '"  | fully blank segments: ' + rail0.blankSegs);
await p.locator('#rail-1440').screenshot({ path: path.join(OUT, 'c-rail-s0.png') }).catch(() => {});

/* ---------- RF-03: margin grouping ---------- */
say('\n--- RF-03 margin groups at 1440, scroll 0 ---');
const marg = await p.evaluate(() => {
  const m = document.querySelector('#frame-1440 .margin, #frame-1440 [class*="margin"]');
  const col = document.querySelector('#frame-1440 aside.margin') || m;
  if (!col) return { err: 'no margin column found' };
  const heads = [...col.querySelectorAll('*')].filter(e => /BESIDE|THE WHOLE JOB/.test(e.textContent) && e.children.length === 0).map(e => ({ sel: e.tagName.toLowerCase() + '.' + (e.className || ''), t: e.textContent.replace(/\s+/g, ' ').trim() }));
  const empties = [...col.querySelectorAll('*')].filter(e => /NOTHING/.test(e.textContent) && e.children.length === 0).map(e => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { t: e.textContent.replace(/\s+/g, ' ').trim(), w: Math.round(r.width), h: Math.round(r.height), lh: cs.lineHeight, lines: Math.round(r.height / parseFloat(cs.lineHeight || '14')) };
  });
  const chips = [...col.querySelectorAll('.margin-chip')].map(c => c.textContent.replace(/\s+/g, ' ').trim().slice(0, 60));
  return { text: col.textContent.replace(/\s+/g, ' ').trim().slice(0, 700), heads, empties, chipCount: chips.length, chips };
});
say('  ' + JSON.stringify(marg, null, 1).slice(0, 2200));
const mEl = await p.$('#frame-1440 aside.margin');
if (mEl) await mEl.screenshot({ path: path.join(OUT, 'c-margin-s0.png') }).catch(() => {});

/* ---------- RF-04 / R-03: mobile bar + 390 reading index ---------- */
say('\n--- RF-04 / R-03 mobile bar ---');
const mob0 = await p.evaluate(() => {
  const f = document.querySelector('#frame-390'); f.scrollTop = 0; return null;
});
await p.evaluate(() => window.__lensSettled && window.__lensSettled());
await p.waitForTimeout(500);
const mobA = await p.evaluate(() => {
  const f = document.querySelector('#frame-390');
  const bar = f.querySelector('.mobile-bar');
  const full = [...f.querySelectorAll('[data-region]')].filter(r => r.getAttribute('data-density') === 'full').map(r => r.getAttribute('data-region'));
  return {
    scrollTop: f.scrollTop,
    frameIdx: f.getAttribute('data-reading-index'),
    barIdx: bar ? bar.getAttribute('data-reading-index') : null,
    rail390: !!document.querySelector('#rail-390'),
    barText: bar ? bar.textContent.replace(/\s+/g, ' ').trim() : null,
    full
  };
});
say('  @0: ' + JSON.stringify(mobA));
await p.evaluate(() => { document.querySelector('#frame-390').scrollTop = 1800; });
await p.evaluate(() => window.__lensSettled && window.__lensSettled());
await p.waitForTimeout(600);
const mobB = await p.evaluate(() => {
  const f = document.querySelector('#frame-390');
  const bar = f.querySelector('.mobile-bar');
  const full = [...f.querySelectorAll('[data-region]')].filter(r => r.getAttribute('data-density') === 'full').map(r => r.getAttribute('data-region'));
  return { scrollTop: f.scrollTop, frameIdx: f.getAttribute('data-reading-index'), barIdx: bar ? bar.getAttribute('data-reading-index') : null, barText: bar ? bar.textContent.replace(/\s+/g, ' ').trim() : null, full };
});
say('  @1800: ' + JSON.stringify(mobB));
const f390 = await p.$('#frame-390');
if (f390) await f390.screenshot({ path: path.join(OUT, 'c-390-s0.png') }).catch(() => {});

/* ---------- R-05 (dropped): Rest clears the motion register ---------- */
say('\n--- R-05 (dropped by MB) re-test ---');
const r05 = await p.evaluate(async () => {
  const press = k => document.querySelector('[data-go="' + k + '"]').click();
  const stage = document.querySelector('#stage') || document.documentElement;
  press('rest'); await new Promise(r => setTimeout(r, 300));
  press('reduced'); await new Promise(r => setTimeout(r, 300));
  const afterReduced = stage.getAttribute('data-motion');
  press('rest'); await new Promise(r => setTimeout(r, 400));
  const afterRest = stage.getAttribute('data-motion');
  press('slow'); await new Promise(r => setTimeout(r, 300));
  const afterSlow = stage.getAttribute('data-motion');
  press('condensed'); await new Promise(r => setTimeout(r, 400));
  const afterCondensed = stage.getAttribute('data-motion');
  press('rest'); await new Promise(r => setTimeout(r, 400));
  const afterRest2 = stage.getAttribute('data-motion');
  return { afterReduced, afterRest, afterSlow, afterCondensed, afterRest2 };
});
say('  ' + JSON.stringify(r05));

/* ---------- R-07: reading bracket across a whole read ---------- */
say('\n--- R-07 reading bracket / paper growth ---');
const br = await p.evaluate(async () => {
  const f = document.querySelector('#frame-1440');
  document.querySelector('[data-go="rest"]').click();
  await new Promise(r => setTimeout(r, 500));
  const bEl = () => document.querySelector('#rail-1440 .window, #rail-1440 [class*="window"], #rail-1440 [class*="bracket"]');
  const measure = () => { const e = bEl(); return e ? Math.round(e.getBoundingClientRect().height) : null; };
  const before = { bracket: measure(), scrollHeight: f.scrollHeight, sel: bEl() ? bEl().className : null };
  for (let i = 0; i <= 30; i++) { f.scrollTop = (f.scrollHeight - f.clientHeight) * (i / 30); await new Promise(r => setTimeout(r, 60)); }
  f.scrollTop = 0; await new Promise(r => setTimeout(r, 600));
  const after = { bracket: measure(), scrollHeight: f.scrollHeight };
  return { before, after };
});
say('  ' + JSON.stringify(br));

/* ---------- R-11 / C.6: dev bar button census ---------- */
say('\n--- R-11 / C.6 dev bar census ---');
const bar = await p.evaluate(() => [...document.querySelectorAll('[data-go]')].map(x => x.getAttribute('data-go') + ' "' + x.textContent.trim() + '"'));
say('  ' + bar.length + ' buttons: ' + JSON.stringify(bar));

/* ---------- C.4: tokens / contrast comments ---------- */
say('\n--- C.4 new token families ---');
const tok = await p.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const names = ['--lens-h-open', '--lens-h-closed', '--doc-region-gap', '--density-ink-full', '--density-ink-reading', '--density-ink-condensed'];
  const o = {}; names.forEach(n => o[n] = cs.getPropertyValue(n).trim()); return o;
});
say('  ' + JSON.stringify(tok));

/* ---------- static paint with JS disabled (C.1) ---------- */
say('\n--- C.1 static paint, JS disabled ---');
const ctx2 = await b.newContext({ viewport: { width: 1560, height: 1000 }, javaScriptEnabled: false });
const p2 = await ctx2.newPage();
await p2.goto(URL_);
await p2.waitForTimeout(600);
const stat = await p2.evaluate(() => {
  const f = document.querySelector('#frame-1440');
  const regions = [...document.querySelectorAll('#frame-1440 [data-region]')];
  const head = document.querySelector('#frame-1440 .region-head, #frame-1440 [class*="region-head"]');
  return {
    frame: !!f, regions: regions.length,
    densities: regions.map(r => r.getAttribute('data-region') + '=' + r.getAttribute('data-density')).join(' '),
    lensState: f ? f.getAttribute('data-lens-state') : null,
    lensOpen: (document.querySelector('#lens-1440') || {}).getAttribute ? document.querySelector('#lens-1440').getAttribute('data-lens-open') : null,
    firstHeadY: head && f ? Math.round(head.getBoundingClientRect().top - f.getBoundingClientRect().top) : null,
    mockReady: typeof window.__mockReady
  };
});
say('  ' + JSON.stringify(stat));
await p2.screenshot({ path: path.join(OUT, 'c-nojs.png'), fullPage: false });
await ctx2.close();

say('\npage errors during claims probe: ' + errs.length + ' ' + JSON.stringify(errs));
fs.writeFileSync(path.join(OUT, 'claims-log.txt'), L.join('\n'));
await b.close();
