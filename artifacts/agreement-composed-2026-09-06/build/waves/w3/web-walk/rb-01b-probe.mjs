import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
const page = await ctx.newPage();
await page.goto(`${DESIGNER}/desk`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await dismissOverlays(page);
await page.getByText('FIND ANYTHING', { exact: false }).first().click();
await page.waitForTimeout(1500);
await page.locator('input').last().fill('agreement');
await page.waitForTimeout(1500);
await page
  .locator('[role="dialog"][aria-label="Command bar"]')
  .getByText('Draft a design agreement')
  .first()
  .click();
await page.waitForTimeout(5000);
await page.locator('[data-testid="client-picker-trigger"]').click();
await page.waitForTimeout(2500);
const dump = await page.evaluate(() => {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).map((d) => ({
    label: d.getAttribute('aria-label'),
    testid: d.getAttribute('data-testid'),
    text: (d.innerText || '').slice(0, 800),
  }));
  const inputs = Array.from(document.querySelectorAll('input')).map(
    (i) => `${i.placeholder || ''}|${i.getAttribute('aria-label') || ''}|${i.id || ''}`,
  );
  return { dialogs, inputs };
});
console.log(JSON.stringify(dump, null, 1));
await shot(page, 'rb-01-probe-picker');
await browser.close();
