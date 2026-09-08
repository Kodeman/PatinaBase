import { launch, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);
const ctrls = await page.evaluate(() => {
  const main = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  const centre = main ? main.children[1] : document.body;
  return Array.from(centre.querySelectorAll('input, select, textarea, button, label, h3, p')).map((e) => ({
    tag: e.tagName,
    type: e.getAttribute('type'),
    id: e.id || null,
    name: e.getAttribute('name'),
    aria: e.getAttribute('aria-label'),
    ph: e.getAttribute('placeholder'),
    val: e.value !== undefined ? String(e.value).slice(0, 30) : null,
    txt: (e.innerText || '').trim().slice(0, 70),
  }));
});
console.log(JSON.stringify(ctrls, null, 0));
await browser.close();
