/** Walk steps 5-7 in the only order the save floor allows: money first. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib.mjs';

const { proposalId } = JSON.parse(fs.readFileSync(`${HERE}/state-walk.json`, 'utf8'));
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
const rpc = [];
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/upsert_agreement_parts/.test(r.url())) return;
  let t = '';
  try { t = (await r.text()).slice(0, 400); } catch {}
  rpc.push(`${r.status()} ${t.slice(0, 200)}`);
});
const rail = () => page.locator('nav[aria-label="Agreement parts"] li');
const pickByName = async (name) => {
  await rail().filter({ hasText: name }).first().locator('button').nth(1).click();
  await page.waitForTimeout(800);
};
const readiness = async (tag) =>
  console.log(`READINESS ${tag}: ` +
    (await page.$eval('section[aria-label="Agreement readiness"]', (n) => n.innerText)).replace(/\n+/g, ' | '));
const save = async (tag) => {
  rpc.length = 0;
  const btn = page.getByRole('button', { name: /^Save agreement$/ });
  if (!(await btn.count())) { console.log(`SAVE ${tag}: nothing dirty`); return; }
  await btn.click();
  await page.waitForTimeout(4500);
  console.log(`SAVE ${tag}: rpc=${JSON.stringify(rpc)} note=${JSON.stringify(
    await page.$$eval('[role="status"]', (ns) => ns.map((x) => x.innerText).filter(Boolean)))}`);
};
const railDump = async (tag) => {
  const rows = await rail().evaluateAll((ns) => ns.map((n) => n.innerText.split('\n')[1] ?? ''));
  console.log(`RAIL ${tag} (${rows.length}): ${rows.join(' · ')}`);
};

await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);
await railDump('start');

// 1 · the fee
await pickByName('Role rates');
await page.getByRole('button', { name: /\+ Add a role/ }).click();
await page.waitForTimeout(500);
await page.getByLabel('Role 1', { exact: true }).fill('Principal designer');
await page.waitForTimeout(300);
await page.getByLabel(/hourly rate/i).first().fill('225.00');
await page.waitForTimeout(500);
await readiness('after role');
await save('after role only');

// 2 · the ceiling
await pickByName('Ceiling');
await page.getByRole('checkbox').first().uncheck();
await page.waitForTimeout(400);
await page.getByLabel(/Design authorization ceiling/i).fill('24000');
await page.waitForTimeout(500);
await readiness('after ceiling');
await save('after ceiling');
await shot(page, 'wf-step6-role-and-ceiling-1280');

// 3 · step 5 — remove Exclusions
await rail().filter({ hasText: 'Exclusions' }).first()
  .getByRole('button', { name: /Part options for Exclusions/i }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Remove$/ }).first().click();
await page.waitForTimeout(600);
await save('after removing Exclusions');
await railDump('after remove');
await shot(page, 'wf-step5-exclusions-removed-1280');

// 4 · retainer / cadence / terms
await pickByName('Retainer');
await page.getByLabel(/Retainer · dollars/i).fill('0');
await page.waitForTimeout(400);
await pickByName('Billing cadence');
const sel = page.locator('section[aria-label$="editor"] select');
await sel.selectOption('biweekly');
await page.waitForTimeout(300);
await sel.selectOption('monthly');
await page.waitForTimeout(400);
await pickByName('Terms');
await page.locator('section[aria-label$="editor"] textarea').first().fill(
  'Ownership of the design documents passes on final payment. Either party may end this agreement on fourteen days written notice. Reimbursable expenses are billed at cost.');
await page.waitForTimeout(500);
await save('after money and terms');
await railDump('final');
await readiness('final');
await shot(page, 'wf-step7-ready-1280');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
await shot(page, 'wf-step7-ready-390');
await b.close();
