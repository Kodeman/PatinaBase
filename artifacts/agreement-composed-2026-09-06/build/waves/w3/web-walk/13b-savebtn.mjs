import { launch, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);
await page.getByRole('button', { name: 'Cost-plus with GMP', exact: true }).click();
await page.waitForTimeout(1200);
const btns = await page.evaluate(() =>
  Array.from(document.querySelectorAll('header button, button')).slice(0, 60).map((b) => ({
    t: (b.innerText || '').trim().slice(0, 40), disabled: b.disabled, key: b.getAttribute('data-action-key'),
  })).filter((b) => /save|saved/i.test(b.t)),
);
console.log(JSON.stringify(btns, null, 1));
await browser.close();
