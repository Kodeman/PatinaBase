/** Step 12 second half — a flat-fee agreement: no rate card, no ceiling. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const proposalId = process.argv[2];
const tag = process.argv[3] ?? 'wq';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(upsert_agreement_parts|send_commercial|set_document_client)/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 180); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
const rail = () => page.locator('nav[aria-label="Agreement parts"] li');
const pick = async (n) => {
  await rail().filter({ hasText: n }).first().locator('button').nth(1).click();
  await page.waitForTimeout(700);
};
const remove = async (n) => {
  await rail().filter({ hasText: n }).first().getByRole('button', { name: new RegExp(`Part options for ${n}`, 'i') }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Remove$/ }).first().click();
  await page.waitForTimeout(600);
};
const save = async (t) => {
  const btn = page.getByRole('button', { name: /^Save agreement$/ });
  if (!(await btn.count())) { console.log(`SAVE ${t}: not dirty`); return; }
  await btn.click();
  await page.waitForTimeout(4000);
  console.log(`SAVE ${t}:`, JSON.stringify(await page.$$eval('[role="status"]', (ns) => ns.map((x) => x.innerText).filter(Boolean))));
};

await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);

// attach the client account through the room's picker
await page.getByRole('combobox', { name: /Client account/i }).click();
await page.waitForTimeout(1200);
await page.getByRole('option', { name: /Client User/i }).first().click();
await page.waitForTimeout(3500);

await remove('Role rates');
await remove('Ceiling');
// Add a Flat fee part from the rail's Add menu
await page.getByRole('button', { name: /\+ Add a part/ }).click();
await page.waitForTimeout(800);
console.log('ADD MENU:', JSON.stringify(await page.$$eval('button', (ns) => ns.map((n) => n.innerText.trim()).filter((t) => /^(Clause|List|Role rates|Ceiling|Retainer|Billing cadence|Furnishings deposit|Flat fee|Fee by phase)$/.test(t)))));
await shot(page, `${tag}-add-menu`);
await page.getByRole('button', { name: /^Flat fee$/ }).click();
await page.waitForTimeout(1000);
console.log('EDITOR:', (await page.$eval('section[aria-label$="editor"]', (n) => n.innerText)).slice(0, 300));
const money = page.locator('section[aria-label$="editor"] input').first();
await money.fill('18000');
await page.waitForTimeout(500);
await pick('Retainer');
await page.getByLabel(/Retainer · dollars/i).fill('3000');
await page.waitForTimeout(400);
await pick('Billing cadence');
const sel = page.locator('section[aria-label$="editor"] select');
await sel.selectOption('milestone');
await page.waitForTimeout(300);
await sel.selectOption('monthly');
await page.waitForTimeout(400);
await pick('Terms');
await page.locator('section[aria-label$="editor"] textarea').first().fill('A flat fee for the whole of the design work, invoiced monthly.');
await page.waitForTimeout(400);
await save('flat fee');
console.log('READINESS:', (await page.$eval('section[aria-label="Agreement readiness"]', (n) => n.innerText)).replace(/\n+/g, ' | '));
await shot(page, `${tag}-flat-composed-1280`);

await page.getByRole('button', { name: /review & send/i }).first().click();
await page.waitForTimeout(3000);
const sendBtn = page.getByRole('button', { name: /^Send agreement/ });
console.log('SEND ENABLED:', !(await sendBtn.isDisabled()));
await shot(page, `${tag}-flat-send-sheet`);
await sendBtn.click();
await page.waitForTimeout(9000);
await shot(page, `${tag}-flat-sent`);
console.log('URL', page.url());
await b.close();
