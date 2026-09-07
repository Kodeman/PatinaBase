import { browser, ctx, shot, HERE } from './lib.mjs';

const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
await page.goto('http://localhost:3000/desk', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await shot(page, '02-desk');
console.log('URL', page.url());
const txt = await page.evaluate(() => document.body.innerText.slice(0, 3000));
console.log('--- TEXT ---\n' + txt);
const links = await page.$$eval('a', (ns) =>
  ns.map((n) => `${n.textContent?.trim().slice(0, 40)} → ${n.getAttribute('href')}`),
);
console.log('--- LINKS ---\n' + links.join('\n'));
await b.close();
