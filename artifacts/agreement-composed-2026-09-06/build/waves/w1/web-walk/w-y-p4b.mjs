import { browser, ctx, shot, HERE } from './lib.mjs';
const proposalId = process.argv[2]; const tag = process.argv[3];
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(upsert_agreement_parts|send_commercial)/.test(r.url())) return;
  let t=''; try{t=(await r.text()).slice(0,140);}catch{}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
const rail = () => page.locator('nav[aria-label="Agreement parts"] li');
const pick = async (n) => { await rail().filter({ hasText: n }).first().locator('button').nth(1).click(); await page.waitForTimeout(700); };
const save = async (t) => {
  const btn = page.getByRole('button', { name: /^Save agreement$/ });
  if (!(await btn.count())) { console.log(`SAVE ${t}: not dirty`); return; }
  await btn.click(); await page.waitForTimeout(4500);
  console.log(`SAVE ${t}:`, JSON.stringify(await page.$$eval('[role="status"]', ns=>ns.map(x=>x.innerText).filter(Boolean))));
};
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await rail().count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
await pick('Ceiling');
const cb = page.getByRole('checkbox').first();
if (await cb.isChecked()) await cb.uncheck();
await page.waitForTimeout(300);
await page.getByLabel(/Design authorization ceiling/i).fill('30000');
await page.waitForTimeout(400);
await save('ceiling');
await pick('Retainer');
await page.getByLabel(/Retainer · dollars/i).fill('0');
await page.waitForTimeout(400);
await pick('Billing cadence');
const sel = page.locator('section[aria-label$="editor"] select');
await sel.selectOption('biweekly'); await page.waitForTimeout(250);
await sel.selectOption('monthly'); await page.waitForTimeout(400);
await pick('Terms');
await page.locator('section[aria-label$="editor"] textarea').first().fill('Ownership, cancellation on fourteen days notice, expenses at cost.');
await page.waitForTimeout(400);
await save('money + terms');
console.log('READINESS:', (await page.$eval('section[aria-label="Agreement readiness"]', n=>n.innerText)).replace(/\n+/g,' | '));
await shot(page, `${tag}-composed`);
await page.getByRole('button', { name: /review & send/i }).first().click();
await page.waitForTimeout(3500);
const sb = page.getByRole('button', { name: /^Send agreement/ });
if (await sb.count()) { console.log('SEND ENABLED:', !(await sb.isDisabled())); await sb.click(); await page.waitForTimeout(9000); }
else console.log('NO SEND BUTTON; dialog text:', (await page.evaluate(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].pop(); return (d??document.body).innerText;})).slice(0,900));
await shot(page, `${tag}-sent`);
await b.close();
