const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + OUT + '/_rv4wrapped.html';
(async () => {
  const browser = await chromium.launch();
  const res = {};
  for (const w of [390, 700, 1024, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(400);
    const before = await page.evaluate(() => ({ docSW: document.documentElement.scrollWidth, over: [...document.querySelectorAll('.scroller')].map(e => e.scrollWidth - e.clientWidth).filter(x => x > 0) }));
    await page.addStyleTag({ content: '.mq{white-space:normal}' });
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({ docSW: document.documentElement.scrollWidth, iw: window.innerWidth, over: [...document.querySelectorAll('.scroller')].map(e => e.scrollWidth - e.clientWidth).filter(x => x > 0) }));
    res[w] = { before, after };
    if (w === 1440) { await page.evaluate(() => { const e = document.getElementById('sheet-2'); e.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/rv4-1440-sheet-2-FIXED.png' }); }
    if (w === 390) { await page.evaluate(() => { const e = document.getElementById('sheet-2'); e.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/rv4-390-sheet-2-FIXED.png' }); }
    await ctx.close();
  }
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
