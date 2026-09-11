/* Deterministic screenshots (reducedMotion => scroll-behavior:auto) of the three
   .widest sheets at the widths that matter. Run from apps/designer-portal. */
const path = require('path');
const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');

const DIR = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + path.join(DIR, '_r2wrapped.html');

(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    for (const [w, h] of [[1440, 900], [1280, 900], [1201, 900], [1024, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(URL, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      for (const n of [3, 10, 14, 6]) {
        await page.evaluate((n) => { document.getElementById('sheet-' + n).scrollIntoView({ behavior: 'auto', block: 'start' }); }, n);
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(DIR, `r3-${w}-${scheme}-sheet${String(n).padStart(2, '0')}.png`) });
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(DIR, `r3-${w}-${scheme}-cover.png`) });
      await ctx.close();
    }
  }
  await browser.close();
  console.log('shots done');
})().catch((e) => { console.error(e); process.exit(1); });
