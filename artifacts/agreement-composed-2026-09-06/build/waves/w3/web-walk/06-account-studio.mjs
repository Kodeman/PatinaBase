import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(`${DESIGNER}/desk?account=studio`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);
await page.waitForTimeout(2000);
console.log('url', page.url());
const dlgs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[role="dialog"]')).map((d) => ({
    label: d.getAttribute('aria-label'),
    text: d.innerText.slice(0, 6000),
  })),
);
console.log(JSON.stringify(dlgs, null, 1));
await shot(page, '06a-account-studio');
await browser.close();
