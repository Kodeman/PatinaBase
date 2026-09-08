import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';

const P = '17143662-9354-4f24-87ea-503f818d0bae';
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
await page.goto(`${DESIGNER}/doc/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await dismissOverlays(page);
const html = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('div,section,form'));
  const el = els.reverse().find((d) => d.innerText?.includes('Countersign for the studio') && d.innerText.length < 2000);
  return el ? el.outerHTML.slice(0, 6000) : 'NOT FOUND';
});
console.log(html);
await browser.close();
