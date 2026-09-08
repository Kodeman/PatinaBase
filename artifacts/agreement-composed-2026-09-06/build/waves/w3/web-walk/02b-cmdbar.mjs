import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
await page.goto(`${DESIGNER}/desk`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await dismissOverlays(page);
await page.getByText('FIND ANYTHING', { exact: false }).first().click();
await page.waitForTimeout(1500);
await shot(page, '02c-cmdbar-open');
const inputs = page.locator('input');
console.log('inputs', await inputs.count());
for (let i = 0; i < (await inputs.count()); i += 1) {
  console.log(i, await inputs.nth(i).getAttribute('placeholder'));
}
const box = inputs.last();
await box.fill('agreement');
await page.waitForTimeout(1500);
console.log('--- text ---');
console.log((await textOf(page)).slice(0, 1500));
await shot(page, '02d-cmdbar-agreement');
await browser.close();
