import { launch, shot, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);
await page.getByRole('button', { name: 'Cost-plus with GMP', exact: true }).click();
await page.waitForTimeout(800);
await page.getByLabel('Fee percent').fill('18');
await page.waitForTimeout(500);
await page.getByRole('button', { name: '+ Add a cost line' }).click();
await page.waitForTimeout(1000);
const ctrls = await page.evaluate(() => {
  const main = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return Array.from(main.children[1].querySelectorAll('input, select, button')).map((e) => ({
    tag: e.tagName, aria: e.getAttribute('aria-label'), ph: e.getAttribute('placeholder'),
    type: e.type, val: String(e.value).slice(0, 24), txt: (e.innerText || '').slice(0, 40),
    opts: e.tagName === 'SELECT' ? Array.from(e.options).map((o) => o.value) : undefined,
  }));
});
console.log(JSON.stringify(ctrls, null, 1));
await shot(page, '12a-one-cost-line');
await browser.close();
