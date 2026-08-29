/* Adversarial review click-through -- The Document / The Smart Lens (W4, MR seat).
   Ported from artifacts/document-life-directions-2026-08-28/mock/final/review-clickthrough.mjs:
   same shape (helpers at the top, numbered sections, say() into review-shots/probe-log.txt),
   same WCAG helpers, reused verbatim. Throwaway probe; not part of the deliverable.

   Covers SPEC.md C.8 items 1-18, in order. Every item prints PASS or FAIL with the
   observed value. No item is skipped and no failure is filtered.

     cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final
     node review-clickthrough.mjs
*/
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + path.join(here, 'index.html');
const OUT = path.join(here, 'review-shots');
fs.mkdirSync(OUT, { recursive: true });

const log = [];
const say = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };

/* ---- contrast helpers (verbatim from the Life Review probe) ---- */
const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const parse = s => { const m = String(s).match(/-?[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
const over = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

/* ---- verdict ledger ---- */
const RESULTS = [];
const item = (n, title, ok, observed) => {
  RESULTS.push({ n, title, ok: !!ok, observed });
  say(`\n[${ok ? 'PASS' : 'FAIL'}] (${n}) ${title}`);
  say(`       observed: ${observed}`);
};

/* ---- in-page helper source, injected once per context ---- */
const HELPERS = `
window.__P = (function () {
  function vis(e) {
    if (!(e instanceof Element)) return false;
    var c = getComputedStyle(e);
    if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) === 0) return false;
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function sel(e) {
    var cls = String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className || '')
      .trim().split(/\\s+/).filter(Boolean).slice(0, 2).join('.');
    return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (cls ? '.' + cls : '');
  }
  function accName(e) {
    var al = e.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    var lb = e.getAttribute('aria-labelledby');
    if (lb) {
      var t = lb.split(/\\s+/).map(function (id) { var n = document.getElementById(id); return n ? n.textContent : ''; }).join(' ').replace(/\\s+/g, ' ').trim();
      if (t) return t;
    }
    if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT') {
      if (e.id) { var l = document.querySelector('label[for="' + e.id + '"]'); if (l && l.textContent.trim()) return l.textContent.replace(/\\s+/g, ' ').trim(); }
      var ph = e.getAttribute('placeholder'); if (ph && ph.trim()) return ph.trim() + ' (placeholder)';
      var vl = e.getAttribute('value'); if (vl && vl.trim()) return vl.trim();
    }
    var tx = (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim();
    if (tx) return tx.slice(0, 70);
    var ti = e.getAttribute('title'); if (ti && ti.trim()) return ti.trim();
    return '';
  }
  var FOCUS_SEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function focusables(root) {
    return [].slice.call((root || document).querySelectorAll(FOCUS_SEL)).filter(vis);
  }
  function effBg(e) {
    var n = e, stack = [];
    while (n && n.nodeType === 1) {
      var c = getComputedStyle(n), bg = c.backgroundColor, m = String(bg).match(/-?[\\d.]+/g);
      if (m) {
        var a = m.length > 3 ? parseFloat(m[3]) : 1;
        if (a > 0) { stack.push([[+m[0], +m[1], +m[2]], a]); if (a >= 0.999) break; }
      }
      n = n.parentElement;
    }
    var base = [255, 255, 255];
    for (var i = stack.length - 1; i >= 0; i--) {
      var l = stack[i];
      base = [0, 1, 2].map(function (k) { return l[0][k] * l[1] + base[k] * (1 - l[1]); });
    }
    return base.map(function (v) { return Math.round(v); });
  }
  function textLeaves(root) {
    var out = [];
    var all = [].slice.call((root || document).querySelectorAll('*'));
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      var own = '';
      for (var j = 0; j < e.childNodes.length; j++) if (e.childNodes[j].nodeType === 3) own += e.childNodes[j].nodeValue;
      own = own.replace(/\\s+/g, ' ').trim();
      if (!own) continue;
      if (!vis(e)) continue;
      out.push(e);
    }
    return out;
  }
  function densityMap(key) {
    var f = document.getElementById('frame-' + key), m = {};
    [].slice.call(f.querySelectorAll('.region')).forEach(function (r) {
      m[r.getAttribute('data-region')] = r.getAttribute('data-density');
    });
    return m;
  }
  function contract() {
    var out = {};
    ['1440', '1280', '390'].forEach(function (k) {
      var f = document.getElementById('frame-' + k);
      var rail = document.getElementById('rail-' + k);
      var lens = document.getElementById('lens-' + k);
      out[k] = {
        lensState: f.getAttribute('data-lens-state'),
        frameReadingIndex: f.getAttribute('data-reading-index'),
        railReadingIndex: rail ? rail.getAttribute('data-reading-index') : null,
        lensOpen: lens ? lens.getAttribute('data-lens-open') : null,
        lensHeight: lens ? getComputedStyle(lens).getPropertyValue('--lens-height').trim() : null,
        scrollTop: Math.round(f.scrollTop),
        density: densityMap(k)
      };
    });
    out.motion = document.getElementById('stage').getAttribute('data-motion');
    return out;
  }
  function railInk(key) {
    var rail = document.getElementById('rail-' + key);
    if (!rail) return null;
    var rr = rail.getBoundingClientRect();
    var ivs = textLeaves(rail).map(function (e) {
      var r = e.getBoundingClientRect();
      return [Math.max(rr.top, r.top), Math.min(rr.bottom, r.bottom)];
    }).filter(function (p) { return p[1] > p[0]; }).sort(function (a, b) { return a[0] - b[0]; });
    var merged = [], cur = null;
    ivs.forEach(function (p) {
      if (!cur || p[0] > cur[1]) { cur = [p[0], p[1]]; merged.push(cur); }
      else cur[1] = Math.max(cur[1], p[1]);
    });
    var ink = merged.reduce(function (s, p) { return s + (p[1] - p[0]); }, 0);
    /* two readings of SC4, because "inkPx" is not defined in the brief:
       util  = merged text-run height / rail height (strict: gaps are unused rail)
       span  = first inked pixel to last inked pixel / rail height (generous) */
    var span = merged.length ? merged[merged.length - 1][1] - merged[0][0] : 0;
    return { inkPx: Math.round(ink), spanPx: Math.round(span), railPx: Math.round(rr.height),
             util: rr.height ? +(ink / rr.height).toFixed(3) : 0,
             spanUtil: rr.height ? +(span / rr.height).toFixed(3) : 0,
             runs: merged.length };
  }
  return { vis: vis, sel: sel, accName: accName, focusables: focusables, effBg: effBg,
           textLeaves: textLeaves, densityMap: densityMap, contract: contract, railInk: railInk };
})();
`;

async function newCtx(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1560, height: 1000 }, deviceScaleFactor: 1 }, opts || {}));
  await ctx.addInitScript(HELPERS);
  return ctx;
}

const settle = p => p.evaluate(() => (window.__lensSettled ? window.__lensSettled() : true));

async function main() {
  const browser = await chromium.launch();

  /* ============================================================= */
  /* (5) NON-ASCII -- bytes on disk, LC_ALL=C equivalent            */
  /* ============================================================= */
  const buf = fs.readFileSync(path.join(here, 'index.html'));
  const bad = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 9 || b === 10 || b === 13) continue;
    if (b < 32 || b > 126) bad.push({ i, b });
  }
  item(5, 'Non-ASCII = 0 (LC_ALL=C)', bad.length === 0,
    `${bad.length} non-ASCII byte(s); file size ${buf.length} bytes` +
    (bad.length ? ' first at offset ' + bad[0].i + ' = 0x' + bad[0].b.toString(16) : ''));

  /* ============================================================= */
  /* MAIN CONTEXT                                                   */
  /* ============================================================= */
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();

  const external = [];
  const pageErrors = [];
  const consoleErrors = [];
  const rejections = [];
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('about:')) external.push(u); });
  page.on('pageerror', e => pageErrors.push(String(e && e.stack ? e.stack : e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.addInitScript(() => {
    window.__rejections = [];
    window.addEventListener('unhandledrejection', e => { window.__rejections.push(String(e.reason)); });
  });

  await page.goto(FILE);
  await page.waitForFunction(() => window.__mockReady === true || window.__mockError, null, { timeout: 15000 }).catch(() => {});
  await settle(page);
  await page.waitForTimeout(800);

  const readyFile = await page.evaluate(() => ({ ready: window.__mockReady === true, err: window.__mockError || null }));
  const rej = await page.evaluate(() => window.__rejections || []);
  rejections.push(...rej);

  /* ============================================================= */
  /* (1) EXTERNAL REQUESTS                                          */
  /* ============================================================= */
  item(1, 'External requests = 0 (network census over the whole load)', external.length === 0,
    `${external.length} non-file/data/about request(s) ${JSON.stringify(external.slice(0, 8))}`);

  /* ============================================================= */
  /* (3a) __mockReady under file://                                 */
  /* ============================================================= */
  say('\n--- (3a) window.__mockReady under file:// ---');
  say(`  __mockReady=${readyFile.ready}  __mockError=${readyFile.err}`);

  /* ============================================================= */
  /* (17) FONTS                                                     */
  /* ============================================================= */
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const fams = ['Playfair Display', 'Inter', 'DM Mono'];
    const checks = {};
    fams.forEach(f => {
      checks[f] = {
        r400: document.fonts.check("400 16px '" + f + "'"),
        r500: document.fonts.check("500 16px '" + f + "'"),
        italic: document.fonts.check("italic 400 16px '" + f + "'")
      };
    });
    const loaded = [];
    document.fonts.forEach(ff => loaded.push(ff.family + ' ' + ff.style + ' ' + ff.weight + ' -> ' + ff.status));
    /* fallback detection: render a probe string in the family, and in a bogus
       family that falls back to the same generic; identical widths = fallback */
    const meas = (fam) => {
      const s = document.createElement('span');
      s.style.cssText = 'position:absolute;left:-9999px;top:0;font-size:64px;white-space:pre;font-family:' + fam;
      s.textContent = 'Vandersteen Hamburgefonstiv 0123';
      document.body.appendChild(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return Math.round(w * 100) / 100;
    };
    const fb = {
      playfair: [meas("'Playfair Display', Georgia, serif"), meas("'__NoSuchFace__', Georgia, serif")],
      inter: [meas("'Inter', -apple-system, sans-serif"), meas("'__NoSuchFace__', -apple-system, sans-serif")],
      dmmono: [meas("'DM Mono', 'SF Mono', monospace"), meas("'__NoSuchFace__', 'SF Mono', monospace")]
    };
    /* what is actually painting on the real headings */
    const used = {};
    const pick = (sel, label) => { const e = document.querySelector(sel); if (e) used[label] = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, ''); };
    pick('#doc-title-1440', 'letterhead 40px');
    pick('#head-approvals-1440', 'region head 24px');
    pick('#frame-1440 .band-1-layer', 'band mono');
    return { checks, loaded, fb, used };
  });
  const fontsOK = ['Playfair Display', 'Inter', 'DM Mono'].every(f => fonts.checks[f].r400) &&
    fonts.fb.playfair[0] !== fonts.fb.playfair[1] &&
    fonts.fb.inter[0] !== fonts.fb.inter[1] &&
    fonts.fb.dmmono[0] !== fonts.fb.dmmono[1];
  say('\n--- (17) fonts ---');
  fonts.loaded.forEach(l => say('  face: ' + l));
  say('  widths (real vs fallback): playfair ' + JSON.stringify(fonts.fb.playfair) +
    ' inter ' + JSON.stringify(fonts.fb.inter) + ' dmmono ' + JSON.stringify(fonts.fb.dmmono));
  item(17, 'Fonts loaded; no fallback face rendering', fontsOK,
    `check() 400: Playfair=${fonts.checks['Playfair Display'].r400} Inter=${fonts.checks['Inter'].r400} DM Mono=${fonts.checks['DM Mono'].r400}; ` +
    `italic Playfair=${fonts.checks['Playfair Display'].italic}; painted: ${JSON.stringify(fonts.used)}; ` +
    `real-vs-fallback widths differ: playfair=${fonts.fb.playfair[0] !== fonts.fb.playfair[1]} inter=${fonts.fb.inter[0] !== fonts.fb.inter[1]} mono=${fonts.fb.dmmono[0] !== fonts.fb.dmmono[1]}`);

  /* ============================================================= */
  /* (4) BOX-SHADOW / DROP-SHADOW CENSUS (computed style)           */
  /* ============================================================= */
  const shadows = await page.evaluate(() => {
    const TOKEN = 'rgba(44, 41, 38, 0.08) 0px 1px 2px 0px';
    const all = [].slice.call(document.querySelectorAll('*'));
    const nonNone = [], drops = [], offToken = [];
    all.forEach(e => {
      const c = getComputedStyle(e);
      const bs = c.boxShadow;
      if (bs && bs !== 'none') {
        const rec = { sel: window.__P.sel(e), value: bs, visible: window.__P.vis(e), frame: (e.closest('.frame') || {}).id || '(stage)' };
        nonNone.push(rec);
        if (bs !== TOKEN) offToken.push(rec);
      }
      const f = (c.filter || '') + ' ' + (c.backdropFilter || '');
      if (/drop-shadow/.test(f)) drops.push({ sel: window.__P.sel(e), filter: c.filter });
      /* pseudo-elements too */
      ['::before', '::after'].forEach(p => {
        const pc = getComputedStyle(e, p);
        if (pc.boxShadow && pc.boxShadow !== 'none') nonNone.push({ sel: window.__P.sel(e) + p, value: pc.boxShadow, visible: true, frame: (e.closest('.frame') || {}).id || '(stage)' });
        if (/drop-shadow/.test(pc.filter || '')) drops.push({ sel: window.__P.sel(e) + p, filter: pc.filter });
      });
    });
    const byClass = {};
    nonNone.forEach(r => { const k = r.sel.replace(/#[^.]*/, ''); byClass[k] = (byClass[k] || 0) + 1; });
    return { total: all.length, nonNone, drops, offToken, byClass, TOKEN };
  });
  const classKeys = Object.keys(shadows.byClass);
  const ALLOWED = ['margin-chip', 'lens-sheet-panel', 'drawer'];
  const strayClasses = classKeys.filter(k => !ALLOWED.some(a => k.includes(a)));
  say('\n--- (4) computed box-shadow census ---');
  say('  elements scanned: ' + shadows.total);
  classKeys.forEach(k => say(`  ${k} x${shadows.byClass[k]}`));
  say('  off-token values: ' + shadows.offToken.length + ' ' + JSON.stringify(shadows.offToken.slice(0, 5)));
  say('  filter: drop-shadow: ' + shadows.drops.length + ' ' + JSON.stringify(shadows.drops.slice(0, 5)));
  item(4, 'box-shadow = only the three --elevation-sheet sites, token value; drop-shadow = 0',
    shadows.offToken.length === 0 && strayClasses.length === 0 && shadows.drops.length === 0,
    `${shadows.nonNone.length} element(s) with a non-none box-shadow across ${shadows.total} elements, in ${classKeys.length} distinct class-site(s): ` +
    JSON.stringify(shadows.byClass) + `; off-token values=${shadows.offToken.length}; stray site classes=${JSON.stringify(strayClasses)}; drop-shadow=${shadows.drops.length}`);

  /* ============================================================= */
  /* (16) SC1-SC4, SC11-SC12 at scroll 0 / 400 / 1200               */
  /* ============================================================= */
  const scAt = async (top) => {
    await page.evaluate(t => { document.getElementById('frame-1440').scrollTo({ top: t, behavior: 'auto' }); }, top);
    await settle(page);
    await page.waitForTimeout(450);
    return page.evaluate(() => {
      const f = document.getElementById('frame-1440');
      const lens = document.getElementById('lens-1440');
      const rail = document.getElementById('rail-1440');
      const fr = f.getBoundingClientRect();
      const heads = [].slice.call(f.querySelectorAll('.region .rh-name'));
      const firstHead = heads[0];
      const lr = lens.getBoundingClientRect();
      const bandBox = [].slice.call(f.querySelectorAll('.lens-band'))[0];
      const dm = window.__P.densityMap('1440');
      const fulls = Object.keys(dm).filter(k => dm[k] === 'full');
      /* SC1 is measured at rest (scroll 0): first region head y inside the frame */
      const headY = firstHead ? Math.round(firstHead.getBoundingClientRect().top - fr.top) : null;
      /* the head at the top of the reading order right now */
      const inView = heads.map(h => ({ id: h.id, y: Math.round(h.getBoundingClientRect().top - fr.top) }));
      return {
        scrollTop: Math.round(f.scrollTop),
        scrollHeight: Math.round(f.scrollHeight), clientHeight: Math.round(f.clientHeight),
        firstHeadY: headY,
        headYs: inView,
        lensHeightVar: getComputedStyle(lens).getPropertyValue('--lens-height').trim(),
        lensBoxH: Math.round(lr.height),
        lensOpen: lens.getAttribute('data-lens-open'),
        bandH: bandBox ? Math.round(bandBox.getBoundingClientRect().height) : null,
        headerStackH: (() => {
          /* SC2: the header band occupancy in the condensed state = paper top
             (as pinned) to the bottom of the pinned band, in frame coordinates */
          return bandBox ? Math.round(bandBox.getBoundingClientRect().bottom - fr.top) : null;
        })(),
        rail: window.__P.railInk('1440'),
        density: dm,
        fulls,
        readingIndexFrame: f.getAttribute('data-reading-index'),
        readingIndexRail: rail.getAttribute('data-reading-index'),
        lensState: f.getAttribute('data-lens-state')
      };
    });
  };
  say('\n--- (16) SC1-SC4, SC11-SC12 at 1440 ---');
  const sc = {};
  for (const t of [0, 400, 1200]) {
    const s = await scAt(t);
    sc[t] = s;
    say(`  scroll ${String(t).padStart(4)}  lensState=${s.lensState} lensOpen=${s.lensOpen} --lens-height=${s.lensHeightVar} lensBox=${s.lensBoxH}px band=${s.bandH}px headerStackBottom=${s.headerStackH}px`);
    say(`             firstRegionHeadY=${s.firstHeadY}px  rail ink=${s.rail.inkPx}/${s.rail.railPx} = ${(s.rail.util * 100).toFixed(1)}% (merged text runs=${s.rail.runs}); rail ink SPAN=${s.rail.spanPx}/${s.rail.railPx} = ${(s.rail.spanUtil * 100).toFixed(1)}%`);
    say(`             density=${JSON.stringify(s.density)}  full=[${s.fulls}]  readingIndex frame=${s.readingIndexFrame} rail=${s.readingIndexRail}`);
    await page.screenshot({ path: path.join(OUT, `16-sc-${t}.png`), clip: await page.evaluate(() => { const r = document.getElementById('frame-1440').getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, 1560), height: Math.min(r.height, 1000 - Math.max(0, r.y)) }; }) }).catch(() => {});
  }
  const SC1 = sc[0].firstHeadY, SC2 = sc[400].headerStackH, SC3 = [sc[0].lensHeightVar, sc[400].lensHeightVar, sc[1200].lensHeightVar];
  const sc3num = parseFloat(sc[400].lensHeightVar);
  const sc3stable = sc[400].lensHeightVar === sc[1200].lensHeightVar;
  const SC4 = sc[0].rail.util;
  const sc11 = [0, 400, 1200].every(t => sc[t].fulls.length === 1);
  const sc12 = [0, 400, 1200].every(t => sc[t].readingIndexRail && sc[t].readingIndexRail === sc[t].fulls[0]);
  say(`  SC1 first region head y @scroll0 = ${SC1}px (threshold <=405px)`);
  say(`  SC2 condensed header band bottom @scroll400 = ${SC2}px (threshold <=108px)`);
  say(`  SC3 --lens-height @0/400/1200 = ${SC3.join(' / ')} (condensed <=64px and stable)`);
  say(`  SC4 rail utilisation @scroll0 = ${(SC4 * 100).toFixed(1)}% merged-ink / ${(sc[0].rail.spanUtil * 100).toFixed(1)}% first-to-last-ink span (threshold >=70%)`);
  say(`  SC11 exactly one full region at each offset = ${sc11}`);
  say(`  SC12 rail reading index === the full region, never null = ${sc12}`);
  item(16, 'SC1-SC4 and SC11-SC12 printed at scroll 0 / 400 / 1200',
    SC1 !== null && SC2 !== null && SC3.every(Boolean) && SC4 > 0,
    `SC1=${SC1}px (<=405 ${SC1 <= 405 ? 'PASS' : 'FAIL'}); SC2=${SC2}px (<=108 ${SC2 <= 108 ? 'PASS' : 'FAIL'}); ` +
    `SC3=${SC3.join('/')} (condensed ${sc3num}px <=64 ${sc3num <= 64 ? 'PASS' : 'FAIL'}, stable=${sc3stable}); ` +
    `SC4=${(SC4 * 100).toFixed(1)}% merged-ink (${sc[0].rail.inkPx}/${sc[0].rail.railPx}px, ${sc[0].rail.runs} runs) / ${(sc[0].rail.spanUtil * 100).toFixed(1)}% first-to-last-ink span (>=70% ${SC4 >= 0.70 ? 'PASS' : 'FAIL'} on the strict reading, ${sc[0].rail.spanUtil >= 0.70 ? 'PASS' : 'FAIL'} on the generous one); SC11=${sc11}; SC12=${sc12}; ` +
    `frame scrollHeight=${sc[0].scrollHeight} client=${sc[0].clientHeight}`);

  /* --- C.5 attribute inventory, all three frames (evidence for 16/SC12) --- */
  const inv = await page.evaluate(() => ['1440', '1280', '390'].map(k => {
    const f = document.getElementById('frame-' + k);
    const rail = document.getElementById('rail-' + k);
    const lens = document.getElementById('lens-' + k);
    return {
      k,
      frameAttrs: { state: f.getAttribute('data-lens-state'), idx: f.getAttribute('data-reading-index') },
      railEl: rail ? window.__P.sel(rail) : '(NO #rail-' + k + ')',
      railIdx: rail ? rail.getAttribute('data-reading-index') : null,
      lensEl: lens ? window.__P.sel(lens) : '(NO #lens-' + k + ')',
      lensOpen: lens ? lens.getAttribute('data-lens-open') : null,
      lensHeight: lens ? getComputedStyle(lens).getPropertyValue('--lens-height').trim() : null,
      regions: f.querySelectorAll('.region').length,
      fulls: [].slice.call(f.querySelectorAll('.region[data-density="full"]')).map(r => r.getAttribute('data-region')),
      scrollHeight: Math.round(f.scrollHeight), clientHeight: Math.round(f.clientHeight),
      overflowY: getComputedStyle(f).overflowY,
      transform: getComputedStyle(f).transform
    };
  }));
  say('\n--- C.5 attribute inventory (evidence) ---');
  inv.forEach(i => say(`  frame-${i.k}: state=${i.frameAttrs.state} frame data-reading-index=${i.frameAttrs.idx} | rail=${i.railEl} data-reading-index=${i.railIdx} | lens=${i.lensEl} open=${i.lensOpen} --lens-height=${i.lensHeight} | regions=${i.regions} full=[${i.fulls}] scroll=${i.scrollHeight}/${i.clientHeight} overflow-y=${i.overflowY} transform=${i.transform}`));

  /* ============================================================= */
  /* (11) KEYBOARD ORDER SURVIVES CONDENSATION                      */
  /* ============================================================= */
  say('\n--- (11) keyboard order at scroll 0 / 400 / 1200 ---');
  const kbResults = [];
  for (const t of [0, 400, 1200]) {
    await page.evaluate(tt => { document.getElementById('frame-1440').scrollTo({ top: tt, behavior: 'auto' }); }, t);
    await settle(page);
    await page.waitForTimeout(350);
    /* mark DOM order on every focusable inside the frame, then really Tab */
    await page.evaluate(() => {
      const f = document.getElementById('frame-1440');
      window.__P.focusables(f).forEach((e, i) => e.setAttribute('data-tabprobe', String(i)));
      f.focus();
    });
    const seq = [];
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press('Tab');
      const cur = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return null;
        const f = document.getElementById('frame-1440');
        if (!f.contains(a)) return { out: true, sel: window.__P.sel(a) };
        const fr = f.getBoundingClientRect(), ar = a.getBoundingClientRect();
        /* the PINNED lens line of this frame, by id -- not the first .lens-band
           in DOM order, and 2.4.11 needs a two-axis intersection with an element
           that is neither inside the band nor the band's own ancestor. */
        const band = document.getElementById('lens-1440');
        const br = band ? band.getBoundingClientRect() : null;
        const cs = getComputedStyle(a);
        const inBand = band ? (band.contains(a) || a.contains(band)) : false;
        const hit = br && !inBand &&
          ar.top < br.bottom - 1 && ar.bottom > br.top + 1 &&
          ar.left < br.right - 1 && ar.right > br.left + 1;
        return {
          out: false,
          idx: a.getAttribute('data-tabprobe'),
          sel: window.__P.sel(a),
          name: window.__P.accName(a),
          top: Math.round(ar.top - fr.top), bottom: Math.round(ar.bottom - fr.top),
          left: Math.round(ar.left - fr.left), right: Math.round(ar.right - fr.left),
          bandBottom: br ? Math.round(br.bottom - fr.top) : null,
          bandTop: br ? Math.round(br.top - fr.top) : null,
          bandLeft: br ? Math.round(br.left - fr.left) : null,
          bandRight: br ? Math.round(br.right - fr.left) : null,
          inBand: inBand,
          obscured: !!hit,
          scrollTop: Math.round(f.scrollTop),
          inFrameV: ar.bottom > fr.top && ar.top < fr.bottom,
          outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor
        };
      });
      if (!cur) break;
      if (cur.out) { seq.push(cur); break; }
      seq.push(cur);
    }
    const inside = seq.filter(s => !s.out);
    let orderOK = true;
    for (let i = 1; i < inside.length; i++) {
      if (inside[i].idx === null || inside[i - 1].idx === null) continue;
      if (Number(inside[i].idx) <= Number(inside[i - 1].idx)) { orderOK = false; break; }
    }
    const obscured = inside.filter(s => s.obscured);
    const noRing = inside.filter(s => s.outline.indexOf('none') === 0 || s.outline.indexOf(' 0px ') > -1);
    kbResults.push({ t, count: inside.length, orderOK, noRing: noRing.length, obscured: obscured.map(o => `${o.sel} rect=[${o.left},${o.top} ${o.right},${o.bottom}] band=[${o.bandLeft},${o.bandTop} ${o.bandRight},${o.bandBottom}] frameScrollTop=${o.scrollTop}`) });
    say(`  scroll ${t}: ${inside.length} stops, DOM order preserved=${orderOK}, obscured-by-pinned-band=${obscured.length}, stops without a focus ring=${noRing.length}`);
    inside.slice(0, 6).forEach(s => say(`     ${String(s.idx).padStart(3)} ${s.sel.padEnd(42)} y=[${s.top},${s.bottom}] x=[${s.left},${s.right}] band y=[${s.bandTop},${s.bandBottom}] x=[${s.bandLeft},${s.bandRight}] outline="${s.outline}"`));
    obscured.forEach(o => say(`     OBSCURED ${o.sel} rect y=[${o.top},${o.bottom}] x=[${o.left},${o.right}] band y=[${o.bandTop},${o.bandBottom}] x=[${o.bandLeft},${o.bandRight}]`));
  }
  const kbOK = kbResults.every(r => r.orderOK && r.obscured.length === 0);
  item(11, 'Keyboard order survives condensation; nothing focused sits under the pinned lens line (2.4.11)', kbOK,
    kbResults.map(r => `@${r.t}: ${r.count} stops order=${r.orderOK} obscured=${r.obscured.length} noFocusRing=${r.noRing}${r.obscured.length ? ' ' + JSON.stringify(r.obscured.slice(0, 3)) : ''}`).join(' | '));

  /* ============================================================= */
  /* (18) FULL TAB-THROUGH WITH ACCESSIBLE NAMES                    */
  /* ============================================================= */
  say('\n--- (18) full tab-through, accessible names ---');
  await page.evaluate(() => { window.scrollTo(0, 0); document.body.setAttribute('tabindex', '-1'); document.body.focus(); });
  const tabAll = [];
  for (let i = 0; i < 520; i++) {
    await page.keyboard.press('Tab');
    const cur = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body || a === document.documentElement) return null;
      return { sel: window.__P.sel(a), name: window.__P.accName(a), tabindex: a.getAttribute('tabindex'), vis: window.__P.vis(a) };
    });
    if (!cur) break;
    if (tabAll.length && tabAll[0].sel === cur.sel && tabAll[0].name === cur.name && i > 5) break;
    tabAll.push(cur);
  }
  const unnamed = tabAll.filter(s => !s.name);
  const posTab = await page.evaluate(() => [].slice.call(document.querySelectorAll('[tabindex]')).filter(e => Number(e.getAttribute('tabindex')) > 0).map(e => window.__P.sel(e)));
  fs.writeFileSync(path.join(OUT, 'tab-order.txt'),
    tabAll.map((s, i) => `${String(i + 1).padStart(3)}. ${s.sel.padEnd(52)} "${s.name}"`).join('\n'));
  say(`  ${tabAll.length} tab stops captured -> review-shots/tab-order.txt`);
  tabAll.slice(0, 14).forEach((s, i) => say(`  ${String(i + 1).padStart(3)}. ${s.sel.padEnd(48)} "${s.name}"`));
  say(`  positive tabindex elements: ${posTab.length} ${JSON.stringify(posTab.slice(0, 5))}`);
  unnamed.forEach(u => say(`  UNNAMED FOCUSABLE: ${u.sel}`));
  item(18, 'Full tab-through: every focusable has an accessible name', unnamed.length === 0,
    `${tabAll.length} tab stops; ${unnamed.length} unnamed ${JSON.stringify(unnamed.slice(0, 6).map(u => u.sel))}; positive tabindex=${posTab.length}`);

  /* ============================================================= */
  /* (14) THE NAVIGATOR LANDS WHERE IT SAYS                         */
  /* ============================================================= */
  say('\n--- (14) rail navigator ---');
  const segIds = await page.evaluate(() => [].slice.call(document.querySelectorAll('#rail-1440 .seg[data-seg]')).map(s => s.getAttribute('data-seg')));
  say('  rail targets: ' + JSON.stringify(segIds));
  const navRows = [];
  for (const id of segIds) {
    await page.evaluate(s => { document.querySelector('#rail-1440 .seg[data-seg="' + s + '"]').click(); }, id);
    await page.waitForTimeout(900);      /* past the 700ms jump lock + 40ms */
    await settle(page);
    await page.waitForTimeout(150);
    const r = await page.evaluate(s => {
      const f = document.getElementById('frame-1440');
      const head = document.getElementById('head-' + s + '-1440');
      const band = f.querySelector('.lens-band');
      const fr = f.getBoundingClientRect(), hr = head.getBoundingClientRect();
      const br = band.getBoundingClientRect();
      return {
        headTopInFrame: Math.round(hr.top - fr.top),
        bandBottomInFrame: Math.round(br.bottom - fr.top),
        underBand: hr.top >= br.bottom - 1,
        readingIndexRail: document.getElementById('rail-1440').getAttribute('data-reading-index'),
        readingIndexFrame: f.getAttribute('data-reading-index'),
        scrollTop: Math.round(f.scrollTop),
        maxScroll: Math.round(f.scrollHeight - f.clientHeight),
        segPressed: document.querySelector('#rail-1440 .seg[data-seg="' + s + '"]').getAttribute('data-reading-index')
      };
    }, id);
    const ok = r.underBand && r.readingIndexRail === id && r.headTopInFrame < 240;
    navRows.push({ id, ok, r });
    say(`  ${id.padEnd(10)} headTop=${String(r.headTopInFrame).padStart(4)}px  bandBottom=${r.bandBottomInFrame}px  underBand=${r.underBand}  readingIndex rail=${r.readingIndexRail} frame=${r.readingIndexFrame}  scrollTop=${r.scrollTop}/${r.maxScroll}  ${ok ? 'PASS' : 'FAIL'}`);
  }
  await page.screenshot({ path: path.join(OUT, '14-navigator-last.png') }).catch(() => {});
  item(14, 'The navigator lands where it says (head under the lens line, index matches after the 700ms lock)',
    navRows.every(n => n.ok),
    navRows.map(n => `${n.id}: headTop=${n.r.headTopInFrame} underBand=${n.r.underBand} index=${n.r.readingIndexRail}`).join(' | '));

  /* ============================================================= */
  /* (6) DEV-BAR STATES REACHABLE AND REVERSIBLE                    */
  /* ============================================================= */
  say('\n--- (6) dev bar: reachable and reversible ---');
  await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
  await settle(page); await page.waitForTimeout(500);
  const restRef = await page.evaluate(() => window.__P.contract());
  say('  reference rest contract: ' + JSON.stringify(restRef));
  const goes = await page.evaluate(() => [].slice.call(document.querySelectorAll('.devbtn')).map(b => ({ go: b.getAttribute('data-go'), label: b.textContent.trim() })));
  const devRows = [];
  for (const g of goes) {
    if (g.go === 'rest') continue;
    await page.evaluate(go => document.querySelector('.devbtn[data-go="' + go + '"]').click(), g.go);
    await page.waitForTimeout(1100);
    await settle(page); await page.waitForTimeout(200);
    const inState = await page.evaluate(() => ({
      c: window.__P.contract(),
      pressed: [].slice.call(document.querySelectorAll('.devbtn')).map(b => b.getAttribute('data-go') + '=' + b.getAttribute('aria-pressed')).join(','),
      stageScroll: Math.round(window.scrollY),
      motionScale: getComputedStyle(document.getElementById('stage')).getPropertyValue('--motion-scale').trim()
    }));
    /* contract for this state */
    let contractOK = true, contractNote = '';
    if (g.go === 'condensed') { contractOK = inState.c['1440'].scrollTop === 400 && inState.c['1440'].lensOpen === 'false'; contractNote = `scrollTop=${inState.c['1440'].scrollTop} lensOpen=${inState.c['1440'].lensOpen}`; }
    else if (g.go === 'ffe') { contractOK = inState.c['1440'].density.ffe === 'full'; contractNote = `ffe density=${inState.c['1440'].density.ffe} readingIndex=${inState.c['1440'].railReadingIndex}`; }
    else if (g.go === 'w1280' || g.go === 'w390') {
      const k = g.go === 'w1280' ? '1280' : '390';
      const seen = await page.evaluate(kk => { const w = document.getElementById('frame-' + kk).parentNode.getBoundingClientRect(); return { top: Math.round(w.top), inView: w.top < window.innerHeight && w.bottom > 0 }; }, k);
      contractOK = seen.inView; contractNote = `wrap top=${seen.top} inView=${seen.inView}`;
    }
    else if (g.go === 'reduced') { contractOK = inState.c.motion === 'reduced' && inState.motionScale === '0'; contractNote = `data-motion=${inState.c.motion} --motion-scale=${inState.motionScale}`; }
    else if (g.go === 'slow') { contractOK = inState.c.motion === 'slow' && inState.motionScale === '4'; contractNote = `data-motion=${inState.c.motion} --motion-scale=${inState.motionScale}`; }
    /* press Rest and compare */
    await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
    await settle(page); await page.waitForTimeout(600);
    const back = await page.evaluate(() => window.__P.contract());
    const diff = [];
    JSON.stringify(restRef) !== JSON.stringify(back) && (() => {
      ['1440', '1280', '390'].forEach(k => {
        Object.keys(restRef[k]).forEach(f => {
          const a = JSON.stringify(restRef[k][f]), b = JSON.stringify(back[k][f]);
          if (a !== b) diff.push(`${k}.${f}: ${a} -> ${b}`);
        });
      });
      if (restRef.motion !== back.motion) diff.push(`motion: ${restRef.motion} -> ${back.motion}`);
    })();
    devRows.push({ go: g.go, label: g.label, contractOK, contractNote, reversible: diff.length === 0, diff, pressed: inState.pressed });
    say(`  ${g.label.padEnd(16)} contract=${contractOK ? 'PASS' : 'FAIL'} (${contractNote})  aria-pressed[${inState.pressed}]  reversible=${diff.length === 0}${diff.length ? ' DIFF ' + JSON.stringify(diff.slice(0, 4)) : ''}`);
  }
  /* the fifth C.5 lens state, `editing`, has no dev-bar button -- reach it the
     only way the document offers, by putting the pen down in a [data-pen] field */
  await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
  await settle(page); await page.waitForTimeout(400);
  const editing = await page.evaluate(() => {
    const pen = document.querySelector('#frame-1440 [data-pen]');
    if (!pen) return { miss: true };
    pen.focus();
    const f = document.getElementById('frame-1440');
    const out = { sel: window.__P.sel(pen), state: f.getAttribute('data-lens-state'), row: (pen.closest('.lens-row-editing') || {}).getAttribute ? pen.closest('.lens-row-editing').getAttribute('data-editing') : null };
    pen.blur();
    return out;
  });
  await settle(page); await page.waitForTimeout(300);
  const afterBlur = await page.evaluate(() => document.getElementById('frame-1440').getAttribute('data-lens-state'));
  say(`  data-lens-state="editing" reachable via [data-pen]: focused ${editing.sel} -> state=${editing.state}; after blur -> ${afterBlur}`);
  item(6, 'Every dev-bar state reachable and reversible (Rest restores every C.5 attribute)',
    devRows.every(d => d.contractOK && d.reversible),
    devRows.map(d => `${d.go}: contract=${d.contractOK ? 'OK' : 'FAIL(' + d.contractNote + ')'} reversible=${d.reversible}${d.diff.length ? ' ' + JSON.stringify(d.diff.slice(0, 2)) : ''}`).join(' | ') +
    ` :: the fifth C.5 state has no button -- [data-pen] focus on ${editing.sel} gives data-lens-state=${editing.state}, blur returns ${afterBlur}` +
    ` :: NOTE Rest also calls setMotion(baseMotion()), so pressing Rest clears data-motion="reduced"/"slow"`);

  /* ============================================================= */
  /* (7) CONDENSATION REACHES STEADY STATE (20 steps @ 4x)          */
  /* ============================================================= */
  say('\n--- (7) condensation steady state, --motion-scale 4, 20 steps down + 20 up ---');
  await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
  await settle(page); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.devbtn[data-go="slow"]').click());
  await page.waitForTimeout(300);
  const scaleNow = await page.evaluate(() => getComputedStyle(document.getElementById('stage')).getPropertyValue('--motion-scale').trim());
  const ext = await page.evaluate(() => { const f = document.getElementById('frame-1440'); return Math.round(f.scrollHeight - f.clientHeight); });
  const STEPS = 20;
  const down = [], up = [];
  for (let i = 0; i <= STEPS; i++) {
    const y = Math.round(ext * i / STEPS);
    await page.evaluate(t => { document.getElementById('frame-1440').scrollTo({ top: t, behavior: 'auto' }); }, y);
    await page.waitForTimeout(140);
    await settle(page);
    down.push({ y, m: await page.evaluate(() => window.__P.densityMap('1440')) });
  }
  for (let i = STEPS; i >= 0; i--) {
    const y = Math.round(ext * i / STEPS);
    await page.evaluate(t => { document.getElementById('frame-1440').scrollTo({ top: t, behavior: 'auto' }); }, y);
    await page.waitForTimeout(140);
    await settle(page);
    up.push({ y, m: await page.evaluate(() => window.__P.densityMap('1440')) });
  }
  /* An oscillation is a FLIP-BACK: within one scroll direction, a region takes
     value X, leaves it at the next step, and is back on X at the step after --
     the boundary chattering. A region that goes condensed -> reading -> full ->
     reading over a whole sweep is not oscillating; it is being scrolled past. */
  const oscillations = [];
  const analyse = (seq, label) => {
    const regions = Object.keys(seq[0].m);
    regions.forEach(r => {
      const vals = seq.map(s => s.m[r]);
      let changes = 0; const at = [];
      for (let i = 1; i < vals.length; i++) {
        if (vals[i] !== vals[i - 1]) { changes++; at.push(`${vals[i - 1]}->${vals[i]}@${seq[i].y}`); }
        if (i >= 2 && vals[i] === vals[i - 2] && vals[i] !== vals[i - 1]) {
          oscillations.push(`${label} ${r}: ${vals[i - 2]} -> ${vals[i - 1]} -> ${vals[i]} across y=${seq[i - 2].y}/${seq[i - 1].y}/${seq[i].y} (flip-back within one step)`);
        }
      }
      say(`  ${label} ${r.padEnd(10)} changes=${changes}  ${at.join(' ')}`);
    });
  };
  analyse(down, 'DOWN');
  analyse(up, '  UP');

  /* the boundaries themselves: bisect for every offset at which the map changes,
     then a 20-step sweep across +/-24px of each one, down and up */
  const mapAtQ = async (y) => { await page.evaluate(t => document.getElementById('frame-1440').scrollTo({ top: t, behavior: 'auto' }), y); await page.waitForTimeout(60); await settle(page); return page.evaluate(() => JSON.stringify(window.__P.densityMap('1440'))); };
  const boundaries = [];
  for (let i = 0; i < down.length - 1; i++) {
    if (JSON.stringify(down[i].m) === JSON.stringify(down[i + 1].m)) continue;
    let a = down[i].y, b = down[i + 1].y;
    const ma = await mapAtQ(a);
    for (let k = 0; k < 14 && b - a > 1; k++) { const mid = Math.round((a + b) / 2); (await mapAtQ(mid)) === ma ? a = mid : b = mid; }
    boundaries.push(b);
  }
  say('  density-map boundaries found by bisection: ' + JSON.stringify(boundaries));
  const fineFails = [];
  for (const bnd of boundaries) {
    const seq = [];
    for (let i = 0; i <= 20; i++) {
      const y = Math.max(0, bnd - 24 + Math.round(48 * i / 20));
      await page.evaluate(t => document.getElementById('frame-1440').scrollTo({ top: t, behavior: 'auto' }), y);
      await page.waitForTimeout(110);
      await settle(page);
      seq.push({ y, m: await page.evaluate(() => window.__P.densityMap('1440')) });
    }
    const regions = Object.keys(seq[0].m);
    const flips = [];
    regions.forEach(r => {
      const v = seq.map(s => s.m[r]);
      let ch = 0;
      for (let i = 1; i < v.length; i++) {
        if (v[i] !== v[i - 1]) ch++;
        if (i >= 2 && v[i] === v[i - 2] && v[i] !== v[i - 1]) flips.push(`${r} ${v[i - 2]}>${v[i - 1]}>${v[i]} @${seq[i].y}`);
      }
      if (ch > 1) flips.push(`${r} changed ${ch}x within +/-24px of the boundary (${[...new Set(v)].join('>')})`);
    });
    say(`  fine sweep across boundary ${bnd} (20 steps over 48px): ${flips.length ? 'UNSTABLE ' + JSON.stringify(flips) : 'stable, one change'}`);
    if (flips.length) fineFails.push(`@${bnd}: ${flips.join('; ')}`);
  }
  item(7, 'Condensation reaches steady state; no oscillation at any boundary at --motion-scale 4',
    oscillations.length === 0 && fineFails.length === 0,
    `--motion-scale=${scaleNow}, extent=${ext}px, ${STEPS} steps each way + a 20-step 48px sweep across each of ${boundaries.length} bisected boundaries ${JSON.stringify(boundaries)}; ` +
    `flip-backs in the coarse sweep=${oscillations.length} ${JSON.stringify(oscillations.slice(0, 3))}; unstable boundaries=${fineFails.length} ${JSON.stringify(fineFails.slice(0, 3))}`);

  /* ============================================================= */
  /* (9) NOTHING MOVES UNDER THE POINTER                            */
  /* ============================================================= */
  say('\n--- (9) nothing moves under the pointer across a density threshold ---');
  await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
  await settle(page); await page.waitForTimeout(400);
  /* find the exact scrollTop at which the density map changes, by bisection */
  const mapAt = async (y) => { await page.evaluate(t => document.getElementById('frame-1440').scrollTo({ top: t, behavior: 'auto' }), y); await settle(page); return page.evaluate(() => JSON.stringify(window.__P.densityMap('1440'))); };
  let lo = 0, hi = Math.min(ext, 2400);
  const mLo = await mapAt(lo), mHi = await mapAt(hi);
  let boundary = null;
  if (mLo !== mHi) {
    let a = lo, b = hi;
    for (let i = 0; i < 16 && b - a > 1; i++) {
      const mid = Math.round((a + b) / 2);
      const mm = await mapAt(mid);
      if (mm === mLo) a = mid; else b = mid;
    }
    boundary = b;
  }
  say(`  density map @${lo}=${mLo}`);
  say(`  density map @${hi}=${mHi}`);
  say(`  first threshold crossing at scrollTop=${boundary}`);
  let ptr = { same: null, delta: null, note: 'no threshold found' };
  if (boundary !== null) {
    const before = boundary - 3, after = boundary + 3;
    await page.evaluate(t => document.getElementById('frame-1440').scrollTo({ top: t, behavior: 'auto' }), before);
    await settle(page); await page.waitForTimeout(250);
    /* park the pointer on an FF&E line if one is in frame, else on whatever line is */
    const parkPoint = await page.evaluate(() => {
      const f = document.getElementById('frame-1440');
      const fr = f.getBoundingClientRect();
      const rows = [].slice.call(f.querySelectorAll('.ffe-row, .appr-row, .sched-row')).filter(window.__P.vis)
        .map(e => ({ e, r: e.getBoundingClientRect() }))
        .filter(o => o.r.top > fr.top + 120 && o.r.bottom < fr.bottom - 120);
      const pick = rows[Math.floor(rows.length / 2)];
      if (!pick) return null;
      return { x: Math.round(pick.r.left + 40), y: Math.round(pick.r.top + pick.r.height / 2), sel: window.__P.sel(pick.e), cls: pick.e.className };
    });
    if (parkPoint) {
      await page.mouse.move(parkPoint.x, parkPoint.y);
      const beforeEl = await page.evaluate(p => {
        const e = document.elementFromPoint(p.x, p.y);
        const row = e && e.closest ? e.closest('.ffe-row, .appr-row, .sched-row') : null;
        window.__parked = row || e;
        return { under: e ? window.__P.sel(e) : null, row: row ? window.__P.sel(row) : null, rowTop: row ? Math.round(row.getBoundingClientRect().top) : null };
      }, parkPoint);
      await page.evaluate(t => document.getElementById('frame-1440').scrollTo({ top: t, behavior: 'auto' }), after);
      await settle(page); await page.waitForTimeout(250);
      const afterEl = await page.evaluate(p => {
        const e = document.elementFromPoint(p.x, p.y);
        const row = e && e.closest ? e.closest('.ffe-row, .appr-row, .sched-row') : null;
        return {
          under: e ? window.__P.sel(e) : null,
          row: row ? window.__P.sel(row) : null,
          sameNode: window.__parked === (row || e),
          parkedTop: window.__parked ? Math.round(window.__parked.getBoundingClientRect().top) : null,
          map: JSON.stringify(window.__P.densityMap('1440'))
        };
      }, parkPoint);
      const scrollDelta = after - before;
      const moved = beforeEl.rowTop - afterEl.parkedTop;
      ptr = {
        same: afterEl.sameNode, delta: moved,
        note: `parked ${beforeEl.row || beforeEl.under} at (${parkPoint.x},${parkPoint.y}); scrolled ${scrollDelta}px across the threshold; ` +
          `element under the pointer after = ${afterEl.row || afterEl.under}; same node = ${afterEl.sameNode}; ` +
          `parked row displaced ${moved}px (scroll alone accounts for ${scrollDelta}px, excess ${moved - scrollDelta}px)`
      };
      say('  ' + ptr.note);
      await page.screenshot({ path: path.join(OUT, '09-pointer.png') }).catch(() => {});
    }
  }
  item(9, 'Nothing moves under the pointer across a density threshold',
    ptr.same === true && Math.abs((ptr.delta || 0) - 6) <= 1,
    ptr.note);

  /* ============================================================= */
  /* (15) 1280 SHOWS THE MARGIN AS A SHEET                          */
  /* ============================================================= */
  say('\n--- (15) 1280: the margin is a sheet ---');
  await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
  await settle(page); await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('frame-1280').parentNode.scrollIntoView({ block: 'start', behavior: 'auto' }));
  await page.waitForTimeout(400);
  const m1280 = await page.evaluate(() => {
    const f = document.getElementById('frame-1280');
    const col = f.querySelector('.margin');
    const tab = f.querySelector('.margin-tab');
    const wrap = document.getElementById('sheet-margin-1280');
    const panel = wrap ? wrap.querySelector('.lens-sheet-panel') : null;
    return {
      marginColumnPresent: !!col && window.__P.vis(col),
      marginTabPresent: !!tab && window.__P.vis(tab),
      tabLabel: tab ? tab.textContent.trim() : null,
      sheetWrapPresent: !!wrap,
      sheetOpenAttr: wrap ? wrap.getAttribute('data-open') : null,
      panelVisibleClosed: panel ? window.__P.vis(panel) : null,
      gridCols: getComputedStyle(f.querySelector('.doc') || f).gridTemplateColumns
    };
  });
  say('  margin as a column present: ' + m1280.marginColumnPresent + ' | margin tab: ' + m1280.marginTabPresent + ' "' + m1280.tabLabel + '"');
  /* a REAL mouse click, so the opener takes focus the way a user's click does --
     a programmatic .click() leaves document.activeElement wherever it was and
     would test the focus-return contract against the wrong opener */
  await page.click('#frame-1280 .margin-tab');
  await page.waitForTimeout(500);
  const m1280open = await page.evaluate(() => {
    const wrap = document.getElementById('sheet-margin-1280');
    const panel = wrap.querySelector('.lens-sheet-panel');
    const a = document.activeElement;
    const pr = panel.getBoundingClientRect();
    return {
      open: wrap.getAttribute('data-open'), ariaHidden: wrap.getAttribute('aria-hidden'),
      role: panel.getAttribute('role'), modal: panel.getAttribute('aria-modal'),
      label: panel.getAttribute('aria-label'),
      visible: window.__P.vis(panel),
      w: Math.round(pr.width), h: Math.round(pr.height),
      shadow: getComputedStyle(panel).boxShadow,
      focusInside: panel.contains(a), focusSel: a ? window.__P.sel(a) : null, focusName: a ? window.__P.accName(a) : null,
      chips: panel.querySelectorAll('.margin-chip').length
    };
  });
  say('  opened: ' + JSON.stringify(m1280open));
  await page.screenshot({ path: path.join(OUT, '15-1280-margin-sheet.png') }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const m1280closed = await page.evaluate(() => {
    const wrap = document.getElementById('sheet-margin-1280');
    const a = document.activeElement;
    return {
      open: wrap.getAttribute('data-open'), ariaHidden: wrap.getAttribute('aria-hidden'),
      panelVisible: window.__P.vis(wrap.querySelector('.lens-sheet-panel')),
      focusSel: a ? window.__P.sel(a) : null, returnedToTab: a ? a.classList.contains('margin-tab') : false
    };
  });
  say('  closed by Escape: ' + JSON.stringify(m1280closed));
  const ok15 = !m1280.marginColumnPresent && m1280.marginTabPresent && m1280open.open === 'true' &&
    m1280open.visible && m1280open.focusInside && m1280closed.open === 'false' && m1280closed.returnedToTab;
  item(15, '1280 shows the margin as a sheet (not a column, not missing); opens, traps focus, Escape returns focus', ok15,
    `margin column visible=${m1280.marginColumnPresent}; tab="${m1280.tabLabel}"; opened role=${m1280open.role} aria-modal=${m1280open.modal} ` +
    `size=${m1280open.w}x${m1280open.h} chips=${m1280open.chips} focus landed on ${m1280open.focusSel} "${m1280open.focusName}" inside=${m1280open.focusInside}; ` +
    `Escape -> data-open=${m1280closed.open} focus returned to ${m1280closed.focusSel} (margin-tab=${m1280closed.returnedToTab})`);

  /* ============================================================= */
  /* (12) NOTHING ESCAPES THE FRAME AT 390                          */
  /* ============================================================= */
  say('\n--- (12) overflow at 390 ---');
  await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
  await settle(page); await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('frame-390').parentNode.scrollIntoView({ block: 'start', behavior: 'auto' }));
  await page.waitForTimeout(400);
  const ovfIn = (key) => page.evaluate(k => {
    const f = document.getElementById('frame-' + k);
    const fr = f.getBoundingClientRect();
    const offenders = [], scrollers = [];
    [].slice.call(f.querySelectorAll('*')).forEach(e => {
      if (!window.__P.vis(e)) return;
      const r = e.getBoundingClientRect();
      if (r.right > fr.right + 1 || r.left < fr.left - 1) offenders.push(window.__P.sel(e) + ' rect=[' + Math.round(r.left - fr.left) + ',' + Math.round(r.right - fr.left) + ']');
      if (e.scrollWidth > e.clientWidth + 1) {
        /* name the child that is doing it, and whether the parent clips */
        const cr = e.getBoundingClientRect();
        const kids = [].slice.call(e.querySelectorAll('*')).filter(window.__P.vis)
          .map(c => ({ c: c, r: c.getBoundingClientRect() }))
          .filter(o => o.r.right > cr.right + 1)
          .sort((a, b) => b.r.right - a.r.right).slice(0, 2)
          .map(o => window.__P.sel(o.c) + ' overhangs ' + Math.round(o.r.right - cr.right) + 'px');
        scrollers.push({
          sel: window.__P.sel(e), sw: e.scrollWidth, cw: e.clientWidth,
          overflowX: getComputedStyle(e).overflowX, clipped: getComputedStyle(e).overflow !== 'visible' || getComputedStyle(e).clipPath !== 'none',
          cause: kids.length ? kids.join(', ') : '(no visible child past the edge -- padding/clip artefact)'
        });
      }
    });
    return {
      frame: f.scrollWidth + '/' + f.clientWidth,
      frameOK: f.scrollWidth <= f.clientWidth,
      offenders: offenders.slice(0, 20), offenderCount: offenders.length,
      scrollers: scrollers, scrollerCount: scrollers.length,
      doc: document.documentElement.scrollWidth + '/' + document.documentElement.clientWidth
    };
  }, key);
  const ovf390 = await ovfIn('390');
  const ovf1440 = await ovfIn('1440');
  const ovf1280 = await ovfIn('1280');
  say('  frame-390 scrollWidth/clientWidth = ' + ovf390.frame + '  (frame itself ' + (ovf390.frameOK ? 'OK' : 'OVERFLOWS') + ')');
  say('  descendants with scrollWidth > clientWidth at 390: ' + ovf390.scrollerCount);
  ovf390.scrollers.slice(0, 24).forEach(s => say(`     ${s.sel.padEnd(40)} ${s.sw}>${s.cw} (+${s.sw - s.cw}) overflow-x=${s.overflowX} clipped=${s.clipped} cause: ${s.cause}`));
  say('  descendants painting past the frame edge at 390: ' + ovf390.offenderCount + ' ' + JSON.stringify(ovf390.offenders));
  say('  for comparison -- same census at 1440: ' + ovf1440.scrollerCount + ' overflowing, ' + ovf1440.offenderCount + ' past the edge; at 1280: ' + ovf1280.scrollerCount + ' / ' + ovf1280.offenderCount);
  const real390 = ovf390.scrollers.filter(s => s.cause.indexOf('(no visible child') !== 0);
  say('  of the 390 overflows, ' + real390.length + ' have a visible child actually hanging past the edge');
  await page.screenshot({ path: path.join(OUT, '12-390.png') }).catch(() => {});
  item(12, 'Nothing escapes the frame at 390 (scrollWidth <= clientWidth on the frame and every descendant)',
    ovf390.frameOK && ovf390.scrollerCount === 0 && ovf390.offenderCount === 0,
    `frame ${ovf390.frame} (frame itself ${ovf390.frameOK ? 'PASS' : 'FAIL'}); ${ovf390.scrollerCount} descendant(s) with scrollWidth > clientWidth, ` +
    `${real390.length} of them with a visible child hanging past their own edge: ` +
    JSON.stringify(ovf390.scrollers.slice(0, 6).map(s => `${s.sel} ${s.sw}>${s.cw} :: ${s.cause}`)) +
    `; ${ovf390.offenderCount} painting past the frame edge; document ${ovf390.doc}; same census at 1440=${ovf1440.scrollerCount}, 1280=${ovf1280.scrollerCount}`);

  /* ============================================================= */
  /* (13) COMPOSITE CONTRAST >= 4.5:1 PER LENS STATE                */
  /* ============================================================= */
  say('\n--- (13) composite contrast per lens state ---');
  const contrastAt = async (label, prep) => {
    await prep();
    await settle(page);
    await page.waitForTimeout(400);
    const rows = await page.evaluate(() => {
      const f = document.getElementById('frame-1440');
      const fr = f.getBoundingClientRect();
      return window.__P.textLeaves(f)
        .filter(e => { const r = e.getBoundingClientRect(); return r.bottom > fr.top && r.top < fr.bottom; })
        .map(e => {
          const c = getComputedStyle(e);
          const region = e.closest('.region');
          return {
            sel: window.__P.sel(e),
            fg: c.color, bg: window.__P.effBg(e),
            size: parseFloat(c.fontSize), weight: c.fontWeight,
            density: region ? region.getAttribute('data-density') : null,
            text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34)
          };
        });
    });
    const bad = [];
    let min = 99, minRow = null;
    rows.forEach(r => {
      const fg = parse(r.fg);
      const a = String(r.fg).match(/-?[\d.]+/g);
      const alpha = a && a.length > 3 ? parseFloat(a[3]) : 1;
      const eff = alpha < 1 ? over(fg, r.bg, alpha) : fg;
      const v = ratio(eff, r.bg);
      const large = r.size >= 24 || (r.size >= 18.66 && Number(r.weight) >= 700);
      const floor = large ? 3.0 : 4.5;
      if (v < min) { min = v; minRow = r; }
      if (v < floor) bad.push(`${v.toFixed(2)} ${r.sel} ${r.fg} on rgb(${r.bg}) ${r.size}px density=${r.density} "${r.text}"`);
    });
    say(`  ${label}: ${rows.length} visible text runs, min ratio ${min.toFixed(2)} (${minRow ? minRow.sel + ' "' + minRow.text + '"' : '-'}), ${bad.length} below floor`);
    bad.slice(0, 10).forEach(b => say('    FAIL ' + b));
    return { label, count: rows.length, min, bad };
  };
  const cRest = await contrastAt('rest (scroll 0)', async () => { await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click()); });
  const cCond = await contrastAt('condensed (scroll 400)', async () => { await page.evaluate(() => document.querySelector('.devbtn[data-go="condensed"]').click()); });
  const cFfe = await contrastAt('region in focus (FF&E full)', async () => { await page.evaluate(() => document.querySelector('.devbtn[data-go="ffe"]').click()); await page.waitForTimeout(900); });
  const cReading = await contrastAt('reading (scroll 1200)', async () => { await page.evaluate(() => document.getElementById('frame-1440').scrollTo({ top: 1200, behavior: 'auto' })); });
  const cAll = [cRest, cCond, cFfe, cReading];
  item(13, 'Composite contrast >= 4.5:1 per lens state (rendered colours, density-reduced text included)',
    cAll.every(c => c.bad.length === 0),
    cAll.map(c => `${c.label}: ${c.count} runs min=${c.min.toFixed(2)} fails=${c.bad.length}`).join(' | ') +
    (cAll.some(c => c.bad.length) ? ' :: ' + JSON.stringify(cAll.flatMap(c => c.bad).slice(0, 6)) : ''));

  /* ============================================================= */
  /* (2) PAGE ERRORS                                                */
  /* ============================================================= */
  const rej2 = await page.evaluate(() => window.__rejections || []);
  const allRej = [...new Set([...rejections, ...rej2])];
  item(2, 'Page errors = 0 (console errors AND unhandled rejections)',
    pageErrors.length === 0 && consoleErrors.length === 0 && allRej.length === 0,
    `pageerror=${pageErrors.length} ${JSON.stringify(pageErrors.slice(0, 3))}; console.error=${consoleErrors.length} ${JSON.stringify(consoleErrors.slice(0, 3))}; unhandledrejection=${allRej.length} ${JSON.stringify(allRej.slice(0, 3))}`);

  /* ============================================================= */
  /* (10a) REDUCED-MOTION PARITY -- VISIBLE TEXT DIFF               */
  /* ============================================================= */
  say('\n--- (10) reduced-motion parity ---');
  const STATES = ['rest', 'condensed', 'ffe', 'w1280', 'w390'];
  const grabText = async (p) => {
    const out = {};
    for (const st of STATES) {
      await p.evaluate(s => document.querySelector('.devbtn[data-go="' + s + '"]').click(), st);
      await p.waitForTimeout(1300);
      await p.evaluate(() => (window.__lensSettled ? window.__lensSettled() : true));
      await p.waitForTimeout(250);
      out[st] = await p.evaluate(() => {
        const r = {};
        ['1440', '1280', '390'].forEach(k => {
          const f = document.getElementById('frame-' + k);
          r[k] = (f.innerText || '').replace(/\s+/g, ' ').trim();
        });
        return r;
      });
    }
    return out;
  };
  await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
  await page.waitForTimeout(500);
  const textNormal = await grabText(page);

  /* dev-bar toggle register, same page */
  await page.evaluate(() => { document.querySelector('.devbtn[data-go="rest"]').click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.devbtn[data-go="reduced"]').click());
  await page.waitForTimeout(400);
  const textToggle = await grabText(page);
  /* the toggle is cleared by Rest inside grabText -- re-assert and record that */
  const toggleSurvives = await page.evaluate(() => document.getElementById('stage').getAttribute('data-motion'));

  const wordDiff = (a, b) => {
    const wa = new Set(a.split(/\s+/).filter(Boolean));
    const wb = new Set(b.split(/\s+/).filter(Boolean));
    const onlyA = [...wa].filter(w => !wb.has(w));
    const onlyB = [...wb].filter(w => !wa.has(w));
    return { onlyA, onlyB };
  };

  /* media-query register, fresh context */
  const ctxR = await newCtx(browser, { reducedMotion: 'reduce' });
  const pR = await ctxR.newPage();
  const rErrors = [];
  pR.on('pageerror', e => rErrors.push(String(e)));
  await pR.goto(FILE);
  await pR.waitForFunction(() => window.__mockReady === true || window.__mockError, null, { timeout: 15000 }).catch(() => {});
  await settle(pR);
  await pR.waitForTimeout(700);
  const textReduced = await grabText(pR);

  const diffs = [];
  STATES.forEach(st => {
    ['1440', '1280', '390'].forEach(k => {
      const d = wordDiff(textNormal[st][k], textReduced[st][k]);
      if (d.onlyA.length || d.onlyB.length) diffs.push(`${st}/${k}: only-animated=${JSON.stringify(d.onlyA.slice(0, 8))} only-reduced=${JSON.stringify(d.onlyB.slice(0, 8))}`);
    });
  });
  const diffsToggle = [];
  STATES.forEach(st => {
    ['1440', '1280', '390'].forEach(k => {
      const d = wordDiff(textNormal[st][k], textToggle[st][k]);
      if (d.onlyA.length || d.onlyB.length) diffsToggle.push(`${st}/${k}: only-animated=${JSON.stringify(d.onlyA.slice(0, 8))} only-toggle=${JSON.stringify(d.onlyB.slice(0, 8))}`);
    });
  });
  say('  visible-text word diffs, animated vs media-query reduced: ' + diffs.length);
  diffs.forEach(d => say('    ' + d));
  say('  visible-text word diffs, animated vs dev-bar toggle: ' + diffsToggle.length);
  diffsToggle.forEach(d => say('    ' + d));
  say('  data-motion after grabText in the toggle register (Rest resets it): ' + toggleSurvives);

  /* (10b) duration census 1s after entering each state, both mechanisms */
  const durCensus = async (p, tag) => {
    const rows = [];
    for (const st of STATES) {
      await p.evaluate(s => document.querySelector('.devbtn[data-go="' + s + '"]').click(), st);
      if (tag === 'toggle') { await p.evaluate(() => { if (document.getElementById('stage').getAttribute('data-motion') !== 'reduced') document.querySelector('.devbtn[data-go="reduced"]').click(); }); }
      await p.waitForTimeout(1000);
      const r = await p.evaluate(() => {
        const bad = [];
        [].slice.call(document.querySelectorAll('.frame *')).forEach(e => {
          const c = getComputedStyle(e);
          const anim = (c.animationDuration || '').split(',').map(s => parseFloat(s) || 0);
          const tr = (c.transitionDuration || '').split(',').map(s => parseFloat(s) || 0);
          const a = anim.some(v => v > 0), t = tr.some(v => v > 0);
          if (a || t) bad.push(window.__P.sel(e) + ' -> ' + (a ? 'anim ' + c.animationDuration + ' (' + c.animationName + ') ' : '') + (t ? 'trans ' + c.transitionDuration + ' (' + c.transitionProperty + ')' : ''));
        });
        return {
          motion: document.getElementById('stage').getAttribute('data-motion'),
          scale: getComputedStyle(document.getElementById('stage')).getPropertyValue('--motion-scale').trim(),
          running: document.getAnimations().filter(a => a.playState === 'running').length,
          total: document.querySelectorAll('.frame *').length,
          bad
        };
      });
      rows.push({ st, ...r });
      say(`  [${tag}] ${st.padEnd(10)} data-motion=${r.motion} --motion-scale="${r.scale}" running=${r.running} nonZeroDuration=${r.bad.length}/${r.total} ${JSON.stringify(r.bad.slice(0, 3))}`);
    }
    return rows;
  };
  const durMQ = await durCensus(pR, 'media-query');
  await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
  await page.waitForTimeout(300);
  const durTG = await durCensus(page, 'toggle');
  await pR.screenshot({ path: path.join(OUT, '10-reduced-mq.png') }).catch(() => {});

  const durOK = durMQ.every(r => r.bad.length === 0) && durTG.every(r => r.bad.length === 0);
  item(10, 'Reduced-motion parity: identical visible text, and 0 non-zero durations 1s after each state (media query AND toggle)',
    diffs.length === 0 && diffsToggle.length === 0 && durOK,
    `text diffs vs media-query=${diffs.length} ${JSON.stringify(diffs.slice(0, 2))}; vs toggle=${diffsToggle.length} ${JSON.stringify(diffsToggle.slice(0, 2))}; ` +
    `duration census media-query=${durMQ.map(r => r.st + ':' + r.bad.length).join(',')}; toggle=${durTG.map(r => r.st + ':' + r.bad.length + '(motion=' + r.motion + ')').join(',')}; ` +
    `page errors in the reduced context=${rErrors.length}`);

  /* ============================================================= */
  /* (8) CLS = 0, NORMAL AND REDUCED                                */
  /* ============================================================= */
  say('\n--- (8) CLS over a scripted 0-to-foot scroll at 1440 ---');
  const clsRun = async (p, tag) => {
    await p.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
    await p.evaluate(() => (window.__lensSettled ? window.__lensSettled() : true));
    await p.waitForTimeout(700);
    await p.evaluate(() => {
      window.__cls = 0; window.__shifts = [];
      window.__po = new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          window.__cls += e.value;
          window.__shifts.push({ v: +e.value.toFixed(5), t: Math.round(e.startTime), sources: (e.sources || []).slice(0, 3).map(s => s.node ? (s.node.nodeType === 1 ? window.__P.sel(s.node) : String(s.node.nodeName)) : '(no node)') });
        }
      });
      window.__po.observe({ type: 'layout-shift', buffered: false });
    });
    await p.waitForTimeout(200);
    await p.evaluate(() => { window.__cls = 0; window.__shifts = []; });
    const extent = await p.evaluate(() => { const f = document.getElementById('frame-1440'); return Math.round(f.scrollHeight - f.clientHeight); });
    for (let i = 1; i <= 30; i++) {
      await p.evaluate(y => document.getElementById('frame-1440').scrollTo({ top: y, behavior: 'auto' }), Math.round(extent * i / 30));
      await p.waitForTimeout(90);
    }
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({ cls: +window.__cls.toFixed(5), shifts: window.__shifts.slice(0, 8), n: window.__shifts.length, extent: Math.round(document.getElementById('frame-1440').scrollHeight - document.getElementById('frame-1440').clientHeight) }));
    say(`  [${tag}] extent=${extent}px  CLS=${r.cls}  shift entries=${r.n} ${JSON.stringify(r.shifts)}`);
    return r;
  };
  const clsNormal = await clsRun(page, 'normal');
  const clsReduced = await clsRun(pR, 'reduced (media query)');
  item(8, 'CLS = 0 over a scripted 0-to-foot scroll at 1440, in both registers',
    clsNormal.cls === 0 && clsReduced.cls === 0,
    `normal CLS=${clsNormal.cls} (${clsNormal.n} entries); reduced CLS=${clsReduced.cls} (${clsReduced.n} entries); extent=${clsNormal.extent}px` +
    (clsNormal.n ? ' first normal shift ' + JSON.stringify(clsNormal.shifts[0]) : '') +
    (clsReduced.n ? ' first reduced shift ' + JSON.stringify(clsReduced.shifts[0]) : ''));

  await ctxR.close();
  await ctx.close();
  await browser.close();

  /* ============================================================= */
  /* (3b) __mockReady UNDER host-sim.mjs                            */
  /* ============================================================= */
  say('\n--- (3b) host-sim.mjs (host inserts the file after load) ---');
  let hostOut = '', hostReady = null, hostErrs = null;
  try {
    hostOut = execFileSync('node', ['host-sim.mjs'], { cwd: here, encoding: 'utf8', timeout: 120000 });
    const m = hostOut.match(/"mockReady":\s*(true|false)/);
    hostReady = m ? m[1] === 'true' : null;
    const pe = hostOut.match(/pageErrors:\s*(\[[\s\S]*?\n\])/);
    const ce = hostOut.match(/consoleErrors:\s*(\[[\s\S]*?\n\])/);
    hostErrs = { pageErrors: pe ? pe[1].replace(/\s+/g, ' ').slice(0, 200) : '?', consoleErrors: ce ? ce[1].replace(/\s+/g, ' ').slice(0, 200) : '?' };
  } catch (e) {
    hostOut = String(e.stdout || '') + String(e.stderr || e.message);
    hostReady = false;
  }
  fs.writeFileSync(path.join(OUT, 'host-sim-out.txt'), hostOut);
  say('  host-sim mockReady=' + hostReady + '  ' + JSON.stringify(hostErrs));
  item(3, 'window.__mockReady is true under file:// AND under host-sim.mjs',
    readyFile.ready === true && hostReady === true,
    `file://: __mockReady=${readyFile.ready} (__mockError=${readyFile.err}); host-sim.mjs: mockReady=${hostReady}, ${JSON.stringify(hostErrs)}`);

  /* ============================================================= */
  /* SUMMARY                                                        */
  /* ============================================================= */
  RESULTS.sort((a, b) => a.n - b.n);
  say('\n=================== SUMMARY ===================');
  RESULTS.forEach(r => say(`  (${String(r.n).padStart(2)}) ${r.ok ? 'PASS' : 'FAIL'}  ${r.title}`));
  const pass = RESULTS.filter(r => r.ok).length;
  say(`  ${pass} PASS / ${RESULTS.length - pass} FAIL of ${RESULTS.length} items`);

  fs.writeFileSync(path.join(OUT, 'probe-log.txt'), log.join('\n'));
  fs.writeFileSync(path.join(here, 'review-results.json'), JSON.stringify({
    results: RESULTS,
    sc: {
      SC1: SC1, SC2: SC2, SC3: SC3, SC4: SC4,
      SC11: [0, 400, 1200].map(t => `${t}:${JSON.stringify(sc[t].density)}`),
      SC12: [0, 400, 1200].map(t => `${t}:${sc[t].readingIndexRail}`)
    },
    scRaw: sc, shadows: shadows.byClass, tabStops: tabAll.length, unnamed: unnamed.length
  }, null, 2));
  console.log('\nlog -> review-shots/probe-log.txt ; json -> review-results.json');
}
main().catch(e => { console.error(e); process.exit(1); });
