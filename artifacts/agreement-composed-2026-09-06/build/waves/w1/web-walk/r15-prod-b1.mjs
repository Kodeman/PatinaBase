/** r2 · B1 re-verify — the first Save of a freshly opened composition, with no
 *  fee and no ceiling typed, must succeed. Then M2/M6 probes. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib2.mjs';

const { proposalId } = JSON.parse(fs.readFileSync(`${HERE}/r2-walk-pprod.json`, 'utf8'));
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-prod.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
const rpc = [];
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(upsert_agreement_parts|materialize_standard_parts)/.test(r.url())) return;
  let t = '';
  try { t = (await r.text()).slice(0, 300); } catch {}
  rpc.push(`${r.request().url().split('/rpc/')[1]} ${r.status()} ${t.slice(0, 220)}`);
});

const rail = () => page.locator('nav[aria-label="Agreement parts"] li');
const pick = async (name) => {
  await rail().filter({ hasText: name }).first().locator('button').nth(1).click();
  await page.waitForTimeout(700);
};
const readiness = async (tag) =>
  console.log(`READINESS ${tag}: ` +
    (await page.$eval('section[aria-label="Agreement readiness"]', (n) => n.innerText)).replace(/\n+/g, ' | '));
const saveState = async () => {
  const btn = page.getByRole('button', { name: /^Save agreement$|^Saved$/ });
  if (!(await btn.count())) return '(no save button)';
  return `label=${JSON.stringify(await btn.first().innerText())} disabled=${await btn.first().isDisabled()}`;
};
const save = async (tag) => {
  rpc.length = 0;
  const btn = page.getByRole('button', { name: /^Save agreement$/ });
  if (!(await btn.count())) { console.log(`SAVE ${tag}: nothing dirty`); return; }
  if (await btn.first().isDisabled()) {
    console.log(`SAVE ${tag}: BUTTON DISABLED (held)`);
    return;
  }
  await btn.click();
  await page.waitForTimeout(4500);
  console.log(`SAVE ${tag}: rpc=${JSON.stringify(rpc)} note=${JSON.stringify(
    await page.$$eval('[role="status"]', (ns) => ns.map((x) => x.innerText).filter(Boolean)))}`);
};

await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await rail().count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);

// ── B1 · write the Terms clause only, then Save. No fee, no ceiling.
await pick('Terms');
await page.locator('section[aria-label$="editor"] textarea').first().fill(
  'Ownership of the design documents passes on final payment. Either party may end this agreement on fourteen days written notice. Reimbursable expenses are billed at cost.');
await page.waitForTimeout(600);
await readiness('B1 before save');
console.log('SAVE BUTTON', await saveState());
await save('B1 — prose only, no fee, no ceiling');
await shot(page, 'r38-prod-b1');

// ── M6 · a second role left unnamed
await pick('Role rates');
await page.getByRole('button', { name: /\+ Add a role/ }).click();
await page.waitForTimeout(500);
await page.getByLabel('Role 1', { exact: true }).fill('Principal designer');
await page.waitForTimeout(300);
await page.getByLabel(/hourly rate/i).first().fill('225.00');
await page.waitForTimeout(600);
await save('one named role');
await page.getByRole('button', { name: /\+ Add a role/ }).click();
await page.waitForTimeout(700);
await readiness('M6 — second role blank');
console.log('M6 SAVE BUTTON', await saveState());
const review = page.getByRole('button', { name: /Review & send/i });
console.log('M6 REVIEW BUTTON disabled=', await review.first().isDisabled().catch(() => 'n/a'));
await shot(page, 'r38-prod-m6');

// ── M2 · a refusal the room does NOT hold: two roles with the same name.
await page.getByLabel('Role 2', { exact: true }).fill('Principal designer');
await page.waitForTimeout(300);
await page.getByLabel(/hourly rate/i).nth(1).fill('180.00');
await page.waitForTimeout(700);
await readiness('M2 — duplicate role name');
console.log('M2 SAVE BUTTON', await saveState());
await save('M2 — duplicate role name');
await shot(page, 'r38-prod-m2');

await b.close();
