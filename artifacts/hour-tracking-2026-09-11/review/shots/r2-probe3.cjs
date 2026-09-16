/* What exactly is hidden by the clipped scrollers, per width. */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const DIR = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + path.join(DIR, '_r2wrapped.html');

(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const w of [1201, 1280, 1440, 1600, 1920]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    out[w] = await page.evaluate(() => {
      const res = [];
      document.querySelectorAll('.scroller').forEach((sc, i) => {
        const clip = sc.scrollWidth - sc.clientWidth;
        if (clip <= 0) return;
        const scRect = sc.getBoundingClientRect();
        const visibleRight = scRect.left + sc.clientWidth;
        const table = sc.querySelector('table');
        const heads = Array.prototype.map.call(table.querySelectorAll('thead th'), (th) => {
          const r = th.getBoundingClientRect();
          return { text: th.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right), hiddenPx: Math.round(Math.max(0, r.right - visibleRight)), fullyHidden: r.left >= visibleRight - 1 };
        });
        const cut = [];
        table.querySelectorAll('tbody td, tfoot td').forEach((td) => {
          const r = td.getBoundingClientRect();
          if (r.right > visibleRight + 1) {
            cut.push({ label: td.getAttribute('data-label'), hidden: Math.round(r.right - visibleRight), fully: r.left >= visibleRight - 1, text: td.textContent.trim().slice(0, 60) });
          }
        });
        res.push({
          scroller: i + 1, tableClass: table.className, clip,
          clientW: sc.clientWidth, scrollW: sc.scrollWidth,
          headers: heads, cutCellCount: cut.length, fullyHiddenCells: cut.filter((c) => c.fully).length,
          sampleCut: cut.slice(0, 4),
        });
      });
      return res;
    });
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(DIR, 'r2-clip.json'), JSON.stringify(out, null, 2));
  for (const w of Object.keys(out)) {
    console.log('== width', w, '==');
    out[w].forEach((s) => {
      console.log(' scroller', s.scroller, s.tableClass, 'clip=' + s.clip, 'cutCells=' + s.cutCellCount, 'fullyHidden=' + s.fullyHiddenCells);
      console.log('   headers:', s.headers.map((h) => h.text + (h.hiddenPx ? ' [hidden ' + h.hiddenPx + 'px' + (h.fullyHidden ? ', ENTIRELY' : '') + ']' : '')).join(' | '));
      if (s.sampleCut.length) console.log('   sample cut:', JSON.stringify(s.sampleCut[0]));
    });
  }
})().catch((e) => { console.error(e); process.exit(1); });
