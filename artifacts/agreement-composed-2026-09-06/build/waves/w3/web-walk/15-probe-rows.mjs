import { launch, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);

const ctrls = async () =>
  page.evaluate(() => {
    const main = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return Array.from(main.children[1].querySelectorAll('input, select, button')).map((e) => ({
      tag: e.tagName, aria: e.getAttribute('aria-label'), ph: e.getAttribute('placeholder'),
      type: e.type, val: String(e.value).slice(0, 20), txt: (e.innerText || '').slice(0, 30),
      opts: e.tagName === 'SELECT' ? Array.from(e.options).map((o) => o.value) : undefined,
    }));
  });

await page.locator('nav[aria-label="Agreement parts"] button', { hasText: 'Draw schedule' }).first().click();
await page.waitForTimeout(1000);
await page.getByRole('button', { name: '+ Add a draw' }).click();
await page.waitForTimeout(800);
console.log('DRAW ROW:', JSON.stringify(await ctrls(), null, 1));

await page.locator('nav[aria-label="Agreement parts"] button', { hasText: 'Allowances' }).first().click();
await page.waitForTimeout(1000);
await page.getByRole('button', { name: '+ Add an allowance' }).click();
await page.waitForTimeout(800);
console.log('ALLOWANCE ROW:', JSON.stringify(await ctrls(), null, 1));
await browser.close();
