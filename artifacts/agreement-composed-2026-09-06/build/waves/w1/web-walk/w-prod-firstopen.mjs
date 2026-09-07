import { browser, ctx, shot, HERE } from './lib.mjs';
const id = process.argv[2];
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-prod.json` });
const page = await c.newPage();
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,300)));
page.on('response', async r => {
  if (!/materialize_standard_parts/.test(r.url())) return;
  let t=''; try{t=await r.text();}catch{}
  try { const j=JSON.parse(t); console.log('  materialize', r.status(), 'partCount', j.partCount, 'materialized', j.materialized); } catch { console.log('  materialize', r.status()); }
});
await page.goto('http://localhost:3000/desk', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.goto(`http://localhost:3000/drafting/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);
console.log('PROD FIRST OPEN rail rows:', await page.locator('nav[aria-label="Agreement parts"] li').count());
console.log('PROD FIRST OPEN readiness:', (await page.$eval('section[aria-label="Agreement readiness"]', n=>n.innerText)).replace(/\n+/g,' | '));
await shot(page, 'w-prod-firstopen');
await b.close();
