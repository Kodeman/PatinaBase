import { browser, ctx, shot, HERE } from './lib2.mjs';

const path = process.argv[2] ?? '/';
const tag = process.argv[3] ?? 'c02';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-client.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(`http://localhost:3002${path}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
console.log('URL', page.url());
await shot(page, `${tag}-1280`);
console.log('--- PAGE TEXT ---');
console.log(await page.evaluate(() => document.body.innerText));
console.log('--- BUTTONS ---');
console.log(JSON.stringify(await page.$$eval('button,a[role="button"]', (ns) =>
  ns.map((n) => n.innerText.trim().slice(0, 50)).filter(Boolean))));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await shot(page, `${tag}-390`);
await b.close();
