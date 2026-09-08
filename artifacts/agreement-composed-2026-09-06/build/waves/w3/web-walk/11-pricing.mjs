import { launch, shot, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);

await page.getByRole('button', { name: 'Cost-plus with GMP', exact: true }).click();
await page.waitForTimeout(1200);
await shot(page, '11a-costplus-gmp');

const centreText = async () => {
  return page.evaluate(() => {
    const main = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return main ? main.children[1].innerText : '';
  });
};
console.log('--- after basis chosen ---');
console.log(await centreText());
const ctrls = await page.evaluate(() => {
  const main = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return Array.from(main.children[1].querySelectorAll('input, select')).map((e) => ({
    aria: e.getAttribute('aria-label'), ph: e.getAttribute('placeholder'), type: e.type, val: e.value,
  }));
});
console.log('CTRLS', JSON.stringify(ctrls));
await browser.close();
