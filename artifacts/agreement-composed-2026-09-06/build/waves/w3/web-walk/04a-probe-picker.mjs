import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
await page.goto(`${DESIGNER}/desk`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await dismissOverlays(page);
await page.getByText('FIND ANYTHING', { exact: false }).first().click();
await page.waitForTimeout(1200);
await page.locator('input').last().fill('agreement');
await page.waitForTimeout(1200);
await page.locator('[role="dialog"][aria-label="Command bar"]').getByText('Draft a design agreement').first().click();
await page.waitForTimeout(3000);
const html = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  return dlg ? dlg.outerHTML.slice(0, 6000) : 'NO DIALOG';
});
console.log(html);
await browser.close();
