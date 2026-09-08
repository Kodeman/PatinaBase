import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);
const html = await page.evaluate(() => {
  const hs = Array.from(document.querySelectorAll('h2, h3, div'));
  const el = hs.find((d) => d.innerText?.includes('HOW THIS AGREEMENT IS PRICED'));
  return el ? el.outerHTML.slice(0, 12000) : 'NOT FOUND';
});
console.log(html);
await browser.close();
