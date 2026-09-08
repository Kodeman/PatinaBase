import { launch, shot, dismissOverlays, HERE } from './lib2.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/r2-room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
const page = await ctx.newPage();
page.on('response', async (r) => {
  if (r.url().includes('/rest/v1/rpc/upsert_agreement_parts')) console.log('RPC upsert ->', r.status());
});
const openPart = async (n) => {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: n }).first().click();
  await page.waitForTimeout(900);
};
const hideBox = () =>
  page.locator('label', { hasText: 'Hidden from your client' }).locator('input[type="checkbox"]').first();

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await dismissOverlays(page);
await openPart('Change orders');
if (await hideBox().isChecked()) {
  await hideBox().uncheck();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Save agreement' }).click();
  await page.waitForTimeout(10000);
  console.log('unhidden + saved');
} else {
  console.log('already visible');
}
await shot(page, 'rb-09-unhidden');
await browser.close();
