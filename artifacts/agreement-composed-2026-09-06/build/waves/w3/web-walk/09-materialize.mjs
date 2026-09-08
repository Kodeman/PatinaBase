import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await dismissOverlays(page);
await page.getByText('Start from a template', { exact: false }).first().click();
await page.waitForTimeout(2500);
const locked = await page.evaluate(() => {
  const li = document.querySelector('li[data-template-locked="true"]');
  return li ? li.innerText : 'NO LOCKED ROW';
});
console.log('locked row now:', JSON.stringify(locked));
await shot(page, '09a-picker-after-attestation');

await page.getByRole('button', { name: /Design-build turnkey/i }).click();
await page.waitForTimeout(800);
await shot(page, '09b-picker-selected');
await page.getByRole('button', { name: /^Use this template$/i }).click();
await page.waitForTimeout(9000);
await shot(page, '09c-turnkey-rail');
console.log('--- room text after materialize ---');
console.log((await textOf(page)).slice(0, 6000));
await browser.close();
