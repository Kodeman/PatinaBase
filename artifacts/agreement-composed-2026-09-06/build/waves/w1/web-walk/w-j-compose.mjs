/** Compose a project-bound draft to ready, optionally send. */
import { browser, ctx, shot, HERE } from './lib.mjs';

const proposalId = process.argv[2];
const tag = process.argv[3];
const doSend = process.argv.includes('--send');

const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(upsert_agreement_parts|send_commercial_document|discard_agreement_parts)/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 160); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
const rail = () => page.locator('nav[aria-label="Agreement parts"] li');
const pick = async (name) => {
  await rail().filter({ hasText: name }).first().locator('button').nth(1).click();
  await page.waitForTimeout(700);
};
const save = async (tagName) => {
  const btn = page.getByRole('button', { name: /^Save agreement$/ });
  if (!(await btn.count())) { console.log(`SAVE ${tagName}: not dirty`); return; }
  await btn.click();
  await page.waitForTimeout(4000);
  console.log(`SAVE ${tagName}:`, JSON.stringify(
    await page.$$eval('[role="status"]', (ns) => ns.map((x) => x.innerText).filter(Boolean))));
};

await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
console.log('RAIL COUNT', await rail().count());

await pick('Role rates');
await page.getByRole('button', { name: /\+ Add a role/ }).click();
await page.waitForTimeout(400);
await page.getByLabel('Role 1', { exact: true }).fill('Principal designer');
await page.waitForTimeout(300);
await page.getByLabel(/hourly rate/i).first().fill('225.00');
await page.waitForTimeout(400);

await pick('Ceiling');
await page.getByRole('checkbox').first().uncheck();
await page.waitForTimeout(300);
await page.getByLabel(/Design authorization ceiling/i).fill('24000');
await page.waitForTimeout(400);
await save('fee + ceiling');

await pick('Retainer');
await page.getByLabel(/Retainer · dollars/i).fill('5000');
await page.waitForTimeout(400);
await pick('Billing cadence');
const sel = page.locator('section[aria-label$="editor"] select');
await sel.selectOption('biweekly');
await page.waitForTimeout(250);
await sel.selectOption('monthly');
await page.waitForTimeout(400);
await pick('Furnishings deposit');
await page.waitForTimeout(300);
await pick('Terms');
await page.locator('section[aria-label$="editor"] textarea').first().fill(
  'Ownership of the design documents passes on final payment. Either party may end this agreement on fourteen days written notice. Reimbursable expenses are billed at cost.');
await page.waitForTimeout(400);
await save('money + terms');
console.log('READINESS:', (await page.$eval('section[aria-label="Agreement readiness"]', (n) => n.innerText)).replace(/\n+/g, ' | '));
await shot(page, `${tag}-composed-1280`);

if (doSend) {
  await page.getByRole('button', { name: /review & send/i }).first().click();
  await page.waitForTimeout(2500);
  await shot(page, `${tag}-send-sheet-1280`);
  const sendBtn = page.getByRole('button', { name: /^Send agreement/ });
  console.log('SEND ENABLED:', !(await sendBtn.isDisabled()));
  await sendBtn.click();
  await page.waitForTimeout(9000);
  await shot(page, `${tag}-sent-1280`);
}
await b.close();
