const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + OUT + '/_rv4wrapped.html';
const out = {};
(async () => {
  const browser = await chromium.launch();
  for (const w of [1440, 1280, 1200, 1024]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(500);
    out['scrollers-' + w] = await page.evaluate(() => [...document.querySelectorAll('.scroller')].map((e, i) => ({
      i, over: e.scrollWidth - e.clientWidth, tbl: e.querySelector('table').getAttribute('aria-labelledby') })).filter(x => x.over > 0));
    out['mqfix-' + w] = await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '.mq{white-space:normal !important}';
      document.body.appendChild(s);
      return [...document.querySelectorAll('.scroller')].map((e, i) => ({ i, over: e.scrollWidth - e.clientWidth })).filter(x => x.over > 0);
    });
    await ctx.close();
  }
  // sticky, instant scroll
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(400);
    await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
    out.sticky = await page.evaluate(() => {
      const sl = document.querySelectorAll('.slide')[13];
      window.scrollTo(0, sl.offsetTop + 1200);
      const g = sl.querySelector('.gutter').getBoundingClientRect();
      const no = sl.querySelector('.sheet-no').textContent.trim();
      return { gutterTop: Math.round(g.top), no, stuck: Math.abs(g.top - 24) < 2 };
    });
    // cover screenshot of truncation at 390
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(500);
    await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
    await page.evaluate(() => { const e = document.querySelector('.mq'); e.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: OUT + '/rv4-390-truncation.png' });
    out.truncation = await page.evaluate(() => {
      const e = document.querySelector('.mq');
      const r = e.getBoundingClientRect();
      return { text: e.textContent.trim(), right: Math.round(r.right), iw: window.innerWidth,
               visibleFraction: +((window.innerWidth - r.left) / r.width).toFixed(2) };
    });
    await ctx.close();
  }
  require('fs').writeFileSync(OUT + '/rv4-report3.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
