import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
const page = await ctx.newPage();
await page.goto(`${DESIGNER}/ledgers/accounts`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
await dismissOverlays(page);
const t = await textOf(page);
console.log('url:', page.url().replace(DESIGNER, ''));
const i = t.indexOf('INV-0003') >= 0 ? t.indexOf('INV-0003') : 0;
console.log(t.slice(Math.max(0, i - 900), i + 1500));
console.log('\nrail names INV-0003 (deposit):', t.includes('INV-0003'));
console.log('rail names INV-0004 (Rough-in):', t.includes('INV-0004'));
console.log('rail names Deposit at signing:', /Deposit at signing/.test(t));
const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a'))
    .map((a) => a.getAttribute('href') || '')
    .filter((h) => h.includes('/pay/') || h.includes('invoice')),
);
console.log('pay/invoice links:', JSON.stringify(links.slice(0, 12)));
await shot(page, 'rb-40-studio-invoice-rail');
await browser.close();
