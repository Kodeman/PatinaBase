import { browser, ctx, shot, HERE } from './lib.mjs';
const id = process.argv[2];
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('console', m => { if (m.type()==='error') console.log('[console.error]', m.text().slice(0,300)); });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,300)));
page.on('response', async r => {
  if (!/rest\/v1\/rpc\/materialize_standard_parts/.test(r.url())) return;
  let t=''; try{t=(await r.text());}catch{}
  console.log('  RPC materialize', r.status(), 'partCount=', (t.match(/"partCount": *(\d+)/)||[])[1], 'materialized=', (t.match(/"materialized": *(\w+)/)||[])[1]);
});
await page.goto('http://localhost:3000/desk', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await page.goto(`http://localhost:3000/drafting/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
console.log('FIRST OPEN rail rows:', await page.locator('nav[aria-label="Agreement parts"] li').count());
console.log('FIRST OPEN readiness:', (await page.$eval('section[aria-label="Agreement readiness"]', n=>n.innerText)).replace(/\n+/g,' | '));
await shot(page, 'w-firstopen2-first');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
console.log('AFTER RELOAD rail rows:', await page.locator('nav[aria-label="Agreement parts"] li').count());
console.log('AFTER RELOAD readiness:', (await page.$eval('section[aria-label="Agreement readiness"]', n=>n.innerText)).replace(/\n+/g,' | '));
await shot(page, 'w-firstopen2-reload');
await b.close();
