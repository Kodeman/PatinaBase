import { browser, ctx, shot, HERE } from './lib.mjs';
const id = process.argv[2]; const tag = process.argv[3] ?? 'probe';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  let t=''; try{t=(await r.text()).slice(0,250);}catch{}
  console.log('RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/drafting/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
console.log('URL', page.url());
await shot(page, tag);
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));
await b.close();
