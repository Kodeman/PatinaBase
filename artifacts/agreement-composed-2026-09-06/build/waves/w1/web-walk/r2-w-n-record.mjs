import { browser, ctx, shot, HERE } from './lib2.mjs';
const id = process.argv[2]; const tag = process.argv[3] ?? 'wn';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  if (!/sign|counter|paper|issue/i.test(r.url())) return;
  let t=''; try{t=(await r.text()).slice(0,300);}catch{}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/doc/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(16000);
await page.getByRole('button', { name: /RECORD THE SIGNATURE/i }).first().click();
await page.waitForTimeout(2500);
await page.locator('input[placeholder="The name on the signature line"]').fill('Client User');
await page.waitForTimeout(600);
await page.getByRole('button', { name: /RECORD SIGNED/i }).click();
await page.waitForTimeout(9000);
await shot(page, `${tag}-recorded`);
console.log('AFTER RECORD:\n' + (await page.evaluate(() => document.body.innerText)).slice(0, 1600));
console.log('BUTTONS:', JSON.stringify(await page.$$eval('button', ns => ns.map(n=>n.innerText.trim().slice(0,40)).filter(Boolean))));
await b.close();
