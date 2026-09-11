const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const url = 'file:///Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots/_wrapped.html';
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
(async () => {
  const browser = await chromium.launch();
  for (const c of [{n:'390-light',w:390,h:844,s:'light'},{n:'390-dark',w:390,h:844,s:'dark'},{n:'1024-light',w:1024,h:768,s:'light'},{n:'1440-light',w:1440,h:900,s:'light'}]) {
    const ctx = await browser.newContext({ viewport:{width:c.w,height:c.h}, colorScheme:c.s, reducedMotion:'reduce' });
    const page = await ctx.newPage();
    await page.goto(url); await page.waitForTimeout(500);
    await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
    for (const id of ['sheet-2','sheet-3','sheet-6','sheet-14']) {
      await page.evaluate((i) => { const el=document.getElementById(i); window.scrollTo(0, el.offsetTop); }, id);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${OUT}/v2-${c.n}-${id}.png` });
    }
    // per-slide height sanity at this width
    const h = await page.evaluate(() => [...document.querySelectorAll('.slide')].map(s=>Math.round(s.getBoundingClientRect().height)));
    console.log(c.n, 'slide heights:', JSON.stringify(h));
    await ctx.close();
  }
  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
