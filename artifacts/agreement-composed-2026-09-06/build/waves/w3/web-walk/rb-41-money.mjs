import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
const page = await ctx.newPage();
await page.goto(`${DESIGNER}/doc/f3fec788-c74f-44ae-bd32-cc2fc0642fdd`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);
await dismissOverlays(page);
const t = await textOf(page);
const i = t.search(/Money/);
console.log('=== the project document, Money region ===');
console.log(t.slice(Math.max(0, i - 200), i + 2200));
console.log('\nnames INV-0003:', t.includes('INV-0003'), '| INV-0004:', t.includes('INV-0004'));
console.log('names Deposit at signing:', /Deposit at signing/.test(t), '| Rough-in:', /Rough-in/.test(t));
const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a'))
    .map((a) => `${(a.innerText || '').trim().slice(0, 30)} -> ${a.getAttribute('href')}`)
    .filter((h) => /pay|invoice/i.test(h)),
);
console.log('pay/invoice links:', JSON.stringify(links.slice(0, 10), null, 1));
await shot(page, 'rb-41-project-money');
await browser.close();
