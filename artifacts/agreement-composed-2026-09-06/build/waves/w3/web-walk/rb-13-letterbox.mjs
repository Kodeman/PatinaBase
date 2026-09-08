import { launch, shot, textOf, CLIENT, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
const page = await ctx.newPage();
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

for (const label of ['OPEN THE LETTERBOX', 'EARLIER INVOICES']) {
  const el = page.getByText(label, { exact: false }).first();
  if (await el.count()) {
    await el.click();
    await page.waitForTimeout(5000);
    const t = await textOf(page);
    console.log(`\n=== after "${label}" (url ${page.url().replace(CLIENT, '')}) ===`);
    console.log('mentions INV-0003:', t.includes('INV-0003'));
    console.log('mentions $8,413.40:', t.includes('$8,413.40'));
    console.log('mentions Deposit at signing:', /Deposit at signing/i.test(t));
    console.log(t.slice(0, 1800));
    await shot(page, `rb-13-${label.replace(/[^a-z]/gi, '-').toLowerCase()}`);
    await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
  } else {
    console.log(`"${label}" not found on the door`);
  }
}
await browser.close();
