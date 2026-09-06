import { open, signIn, openHouse, shot, t, IDS } from './lib.mjs';
const { browser, page } = await open({ width: 390, height: 844 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(3000);
await shot(page, '21-doorstep-390', false);
const ask = page.locator(`#approval-${IDS.successor}`);
await ask.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await shot(page, '22-successor-390', false);
const pd = page.locator(`#approval-${IDS.g6overdue}`);
await pd.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await shot(page, '23-past-due-390', false);
// the records fold at 390
await page.locator('[data-testid="approval-records"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await shot(page, '24-records-390', false);
await browser.close();
