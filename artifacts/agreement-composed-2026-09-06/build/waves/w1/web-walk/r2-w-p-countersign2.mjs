import { browser, ctx, shot, HERE } from './lib2.mjs';
const id = process.argv[2]; const tag = process.argv[3] ?? 'wp';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  if (!/sign|counter|authorit/i.test(r.url())) return;
  let t=''; try{t=(await r.text()).slice(0,500);}catch{}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/doc/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(16000);
await page.getByLabel('Studio signer name').fill('Leah Hartwell');
await page.waitForTimeout(800);
const cbs = page.locator('input[type="checkbox"]');
console.log('checkboxes', await cbs.count());
for (let i = 0; i < (await cbs.count()); i++) await cbs.nth(i).check().catch(()=>{});
await page.waitForTimeout(800);
const btn = page.getByRole('button', { name: /^Countersign agreement$/ });
console.log('countersign disabled:', await btn.isDisabled());
await shot(page, `${tag}-ready`);
if (!(await btn.isDisabled())) {
  await btn.click();
  await page.waitForTimeout(12000);
  await shot(page, `${tag}-after`);
  console.log('AFTER:\n' + (await page.evaluate(() => document.body.innerText)).slice(0, 1500));
}
await b.close();
