/** P4 — compose with an unset retainer (0) and unset deposit, attach the client, send. */
import { browser, ctx, shot, HERE } from './lib.mjs';
const proposalId = process.argv[2]; const tag = process.argv[3];
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(upsert_agreement_parts|send_commercial|set_document_client)/.test(r.url())) return;
  let t=''; try{t=(await r.text()).slice(0,150);}catch{}
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
await page.getByRole('combobox', { name: /Client account/i }).click();
await page.waitForTimeout(1200);
await page.getByRole('option', { name: /Client User/i }).first().click();
await page.waitForTimeout(3500);
await pick('Role rates');
await page.getByRole('button', { name: /\+ Add a role/ }).click();
await page.waitForTimeout(400);
await page.getByLabel('Role 1', { exact: true }).fill('Principal designer');
await page.waitForTimeout(300);
await page.getByLabel(/hourly rate/i).first().fill('210');
await page.waitForTimeout(400);
await pick('Ceiling');
await page.getByRole('checkbox').first().uncheck();
await page.waitForTimeout(300);
await page.getByLabel(/Design authorization ceiling/i).fill('30000');
await page.waitForTimeout(400);
await save('fee + ceiling');
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
await page.waitForTimeout(3000);
const sb = page.getByRole('button', { name: /^Send agreement/ });
console.log('SEND ENABLED:', !(await sb.isDisabled()));
await sb.click(); await page.waitForTimeout(9000);
await shot(page, `${tag}-sent`);
await b.close();
