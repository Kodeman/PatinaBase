import { launch, shot, CLIENT, HERE } from './lib.mjs';
import fs from 'node:fs';

const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await page.getByRole('button', { name: /READ IT IN FULL/i }).click().catch(async () => {
  await page.getByText('READ IT IN FULL', { exact: false }).first().click();
});
await page.waitForTimeout(4000);
await shot(page, '25a-read-in-full');
const t = await page.evaluate(() => document.body.innerText);
fs.writeFileSync(`${HERE}/client-full-paper.txt`, t);
console.log(t.slice(0, 7000));
await browser.close();
