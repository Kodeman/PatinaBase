import { browser, ctx, shot, HERE } from './lib.mjs';
const id = process.argv[2]; const tag = process.argv[3];
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0,250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  if (!/send_commercial|design_services_draft/.test(r.url())) return;
  let t=''; try{t=(await r.text()).slice(0,180);}catch{}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/drafting/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
const tas = page.locator('textarea');
console.log('textareas', await tas.count());
await tas.last().fill('Ownership of the design documents passes on final payment. Either party may end this agreement on fourteen days written notice.');
await page.waitForTimeout(800);
await page.getByRole('button', { name: /^Save agreement$/ }).click();
await page.waitForTimeout(6000);
console.log('SHELL:', await page.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(n=>n.children.length===0 && /facets written/i.test(n.textContent||'')); return el?el.textContent.trim():null;}));
await page.getByRole('button', { name: /review & send/i }).first().click();
await page.waitForTimeout(3500);
const sb = page.getByRole('button', { name: /^Send agreement/ });
console.log('SEND ENABLED:', await sb.count() ? !(await sb.isDisabled()) : 'absent');
if (await sb.count() && !(await sb.isDisabled())) { await sb.click(); await page.waitForTimeout(9000); }
await shot(page, `${tag}-after`);
await b.close();
