import { launch, shot, textOf, CLIENT, HERE } from './lib3.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r3-client-state.json` });
const page = await ctx.newPage();
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await page.getByRole('button', { name: /EARLIER INVOICES/i }).first().click();
await page.waitForTimeout(4000);
await shot(page, 'r3-31a-earlier-invoices');
const t = await textOf(page);
const seg = t.split('EARLIER INVOICES')[1]?.slice(0, 1200) ?? '(none)';
console.log('=== EARLIER INVOICES ===');
console.log(seg);
console.log('\nnames the deposit:', /8,413/.test(t));
console.log('still labelled "not for a house":', /not for a house/i.test(t));
await browser.close();
