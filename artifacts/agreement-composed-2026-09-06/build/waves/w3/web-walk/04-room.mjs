import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib.mjs';
import fs from 'node:fs';

const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(`${DESIGNER}/desk`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await dismissOverlays(page);
await page.getByText('FIND ANYTHING', { exact: false }).first().click();
await page.waitForTimeout(1200);
await page.locator('input').last().fill('agreement');
await page.waitForTimeout(1200);
await page
  .locator('[role="dialog"][aria-label="Command bar"]')
  .getByText('Draft a design agreement')
  .first()
  .click();
await page.waitForTimeout(3000);

await page.locator('[data-testid="client-picker-trigger"]').click();
await page.waitForTimeout(1500);
await shot(page, '04a-household-open');
const opts = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[role="option"], [cmdk-item], li'))
    .map((e) => (e.innerText || '').trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 30),
);
console.log('options:', JSON.stringify(opts));
await page.getByText('Client User', { exact: false }).first().click();
await page.waitForTimeout(9000);
console.log('url:', page.url());
fs.writeFileSync(`${HERE}/room-url.txt`, page.url());
await shot(page, '04b-contract-room');
console.log('--- room text ---');
console.log((await textOf(page)).slice(0, 5000));
await browser.close();
