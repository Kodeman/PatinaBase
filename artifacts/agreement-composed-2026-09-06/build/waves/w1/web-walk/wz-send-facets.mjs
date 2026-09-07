/** Flag-off: send a parts-less agreement from the seven-facet room. */
import { browser, ctx, shot, HERE } from './lib.mjs';
const id = process.argv[2]; const tag = process.argv[3];
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0,250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  if (!/send_commercial|set_document_client|design_services_draft/.test(r.url())) return;
  let t=''; try{t=(await r.text()).slice(0,180);}catch{}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/drafting/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
await page.getByRole('combobox', { name: /Client account/i }).click();
await page.waitForTimeout(1200);
await page.getByRole('option', { name: /Client User/i }).first().click();
await page.waitForTimeout(4000);
await page.getByRole('button', { name: /review & send/i }).first().click();
await page.waitForTimeout(3500);
await shot(page, `${tag}-send-sheet`);
const sb = page.getByRole('button', { name: /^Send agreement/ });
console.log('SEND ENABLED:', await sb.count() ? !(await sb.isDisabled()) : 'absent');
console.log('SHEET:', (await page.evaluate(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].pop(); return (d??document.body).innerText;})).slice(0,900));
if (await sb.count() && !(await sb.isDisabled())) { await sb.click(); await page.waitForTimeout(9000); }
await shot(page, `${tag}-after`);
await b.close();
