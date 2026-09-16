// Round-6 render sweep. Derived from r5b-check.cjs.
// Rebuilds the publish wrapper from the CURRENT deck source, then asserts the
// brief's four conditions at every width in the band, not just the endpoints:
//   A1  documentElement.scrollWidth <= innerWidth
//   A2  no .scroller with scrollWidth > clientWidth + 3
//   A3  no <td> narrower than 160px in #sheet-14's question column (>= 861 only)
//   A4  no element outside a .scroller with right > innerWidth
const { createRequire } = require('module');
const fs = require('fs');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');

const ROOT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11';
const OUT = ROOT + '/review/shots';
const src = fs.readFileSync(ROOT + '/deck/src/index.html', 'utf8');

const SHELL_PRE = '<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"></head><body style="margin:0">';
fs.writeFileSync(OUT + '/_r6wrapped.html', SHELL_PRE + src + '</body></html>');
const URL = 'file://' + OUT + '/_r6wrapped.html';

const WIDTHS = [390, 700, 861, 1001, 1024, 1280, 1440];
const HEIGHTS = [844, 900];

const PROBE = `(() => {
  const iw = window.innerWidth;

  // A1
  const a1 = { scrollWidth: document.documentElement.scrollWidth, innerWidth: iw };
  a1.pass = a1.scrollWidth <= iw;

  // A2
  const overflowing = [...document.querySelectorAll('.scroller')].map(e => {
    const t = e.querySelector('table');
    const sec = e.closest('section');
    return { sheet: sec ? sec.id : null, table: t ? t.className : null,
             scrollWidth: e.scrollWidth, clientWidth: e.clientWidth,
             delta: e.scrollWidth - e.clientWidth };
  }).filter(x => x.delta > 3);
  const a2 = { overflowing, pass: overflowing.length === 0 };

  // A3 — #sheet-14 question column (3rd cell of each body row)
  const qcells = [...document.querySelectorAll('#sheet-14 table.sheet tbody tr')]
    .map(tr => tr.children[2]).filter(Boolean);
  const qwidths = qcells.map(td => +td.getBoundingClientRect().width.toFixed(1));
  const a3 = {
    applicable: iw >= 861,
    cells: qcells.length,
    min: qwidths.length ? Math.min.apply(null, qwidths) : null,
    max: qwidths.length ? Math.max.apply(null, qwidths) : null,
    narrow: iw >= 861 ? qwidths.filter(w => w < 160).length : 0
  };
  a3.pass = iw < 861 ? true : (a3.cells > 0 && a3.narrow === 0);

  // A4 — anything outside a .scroller sticking past the viewport
  const outside = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.width <= 1.5 && r.height <= 1.5) return;              // clipped visually-hidden
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    if (r.right > iw + 0.5) {
      if (el.closest && el.closest('.scroller')) return;
      // a clipped ancestor (the ::before-label thead trick) is not visible overflow
      let p = el.parentElement, clipped = false;
      while (p) {
        const pcs = getComputedStyle(p);
        if (pcs.clipPath && pcs.clipPath !== 'none') { clipped = true; break; }
        if (pcs.overflow === 'hidden' && p.getBoundingClientRect().width <= 2) { clipped = true; break; }
        p = p.parentElement;
      }
      if (clipped) return;
      outside.push({ tag: el.tagName,
        cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '',
        left: +r.left.toFixed(2), right: +r.right.toFixed(2),
        text: (el.textContent || '').trim().slice(0, 60) });
    }
  });
  const a4 = { offendersOutsideScroller: outside, pass: outside.length === 0 };

  // diagnostics (not assertions)
  const row14 = document.querySelector('#sheet-14 table.sheet tbody tr');
  const cols14 = row14 ? [...row14.children].map(td => +td.getBoundingClientRect().width.toFixed(1)) : [];
  const names = [...document.querySelectorAll('.scroller[role="region"]')]
    .map(e => { const s = e.closest('section'); return (s ? s.id : '?') + ' :: ' + e.getAttribute('aria-label'); });

  return { iw, a1, a2, a3, a4, cols14, regionNames: names };
})()`;

async function settle(page) {
  await page.waitForTimeout(400);
  try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  let failures = 0;

  for (const width of WIDTHS) {
    for (const height of HEIGHTS) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const page = await ctx.newPage();
      await page.goto(URL);
      await settle(page);
      const r = await page.evaluate(PROBE);
      r.viewport = width + 'x' + height;
      const bad = ['a1', 'a2', 'a3', 'a4'].filter(k => !r[k].pass);
      r.failed = bad;
      failures += bad.length;
      results.push(r);

      if ((width === 1001 || width === 1024) && height === 900) {
        const el = await page.$('#sheet-14');
        if (el) await el.screenshot({ path: OUT + '/r6-' + width + '-sheet14.png' });
      }
      await ctx.close();
    }
  }

  await browser.close();

  const lines = [];
  lines.push('ROUND-6 SWEEP — ' + new Date().toISOString());
  lines.push('widths ' + WIDTHS.join(' / ') + ' x heights ' + HEIGHTS.join(' / '));
  lines.push('');
  lines.push('| viewport | A1 docSW<=iw | A2 scrollers | A3 q-col>=160 | A4 outside |');
  lines.push('|---|---|---|---|---|');
  for (const r of results) {
    lines.push('| ' + r.viewport +
      ' | ' + (r.a1.pass ? 'PASS' : 'FAIL ' + r.a1.scrollWidth + '>' + r.a1.innerWidth) +
      ' | ' + (r.a2.pass ? 'PASS' : 'FAIL ' + JSON.stringify(r.a2.overflowing)) +
      ' | ' + (r.a3.applicable ? (r.a3.pass ? 'PASS min=' + r.a3.min : 'FAIL min=' + r.a3.min + ' n=' + r.a3.narrow) : 'n/a') +
      ' | ' + (r.a4.pass ? 'PASS' : 'FAIL ' + JSON.stringify(r.a4.offendersOutsideScroller)) + ' |');
  }
  lines.push('');
  lines.push('sheet-14 column widths (row 1), by viewport:');
  for (const r of results) lines.push('  ' + r.viewport + ' -> [' + r.cols14.join(', ') + ']');
  lines.push('');
  lines.push('announced scroller region names:');
  for (const r of results) {
    if (r.regionNames.length) lines.push('  ' + r.viewport + ' -> ' + JSON.stringify(r.regionNames));
  }
  lines.push('');
  lines.push(failures === 0 ? 'ALL ASSERTIONS PASS (' + results.length + ' viewports x 4)' : failures + ' ASSERTION FAILURES');

  const text = lines.join('\n');
  fs.writeFileSync(OUT + '/r6-sweep.txt', text + '\n');
  fs.writeFileSync(OUT + '/r6-sweep.json', JSON.stringify(results, null, 2));
  console.log(text);
  process.exit(failures === 0 ? 0 : 1);
})();
