import { browser, ctx, shot, HERE } from './lib.mjs';

const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:3000/desk', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.keyboard.press('Meta+k');
await page.waitForTimeout(1500);
await shot(page, '03a-cmdk');
console.log(await page.evaluate(() => document.body.innerText.slice(0, 1500)));
const input = page.locator('input[type="search"], input[role="combobox"], [role="dialog"] input');
if (await input.count()) {
  await input.first().fill('agreement');
  await page.waitForTimeout(1200);
  await shot(page, '03b-cmdk-agreement');
  console.log('--- after typing ---');
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 2000)));
}
await b.close();
