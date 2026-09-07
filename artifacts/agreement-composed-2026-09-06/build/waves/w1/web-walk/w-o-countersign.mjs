import { browser, ctx, shot, HERE } from './lib.mjs';
const id = process.argv[2]; const tag = process.argv[3] ?? 'wo';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  if (!/sign|counter|authorit/i.test(r.url())) return;
  let t=''; try{t=(await r.text()).slice(0,400);}catch{}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/doc/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(16000);
await shot(page, `${tag}-before`);
const area = await page.evaluate(() => document.body.innerText.slice(0, 4000));
console.log('CONTROLS:', JSON.stringify(await page.evaluate(() => ({
  inputs: [...document.querySelectorAll('input')].map(n=>({t:n.type,ph:n.placeholder,al:n.getAttribute('aria-label')})),
  buttons: [...document.querySelectorAll('button')].map(n=>({t:n.innerText.trim().slice(0,45),d:n.disabled})).filter(x=>x.t),
}))));
// The countersign act
const name = page.locator('input[type="text"]').filter({ hasNot: page.locator('[readonly]') });
const nameCount = await name.count();
console.log('text inputs', nameCount);
await b.close();
