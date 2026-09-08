import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
await dismissOverlays(page);
await page.getByText('Start from a template', { exact: false }).first().click();
await page.waitForTimeout(2500);
await shot(page, '05a-template-picker');
const dlg = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = nodes[nodes.length - 1];
  return d ? { text: d.innerText, html: d.outerHTML.slice(0, 9000) } : null;
});
console.log('--- picker text ---');
console.log(dlg?.text);
console.log('--- picker html ---');
console.log(dlg?.html);
await browser.close();
