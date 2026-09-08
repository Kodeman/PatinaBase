import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';

const P = '17143662-9354-4f24-87ea-503f818d0bae';
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(`${DESIGNER}/drafting/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await dismissOverlays(page);
await shot(page, '37a-room-executed');
console.log('url', page.url());
const t = await page.evaluate(() => document.body.innerText);
console.log(t.slice(0, 5000));
await browser.close();
