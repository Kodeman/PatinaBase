/** r2 · walk steps 5-7: remove Exclusions, one role, the ceiling, the required prose. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib2.mjs';

const { proposalId } = JSON.parse(fs.readFileSync(`${HERE}/r2-walk-p1.json`, 'utf8'));
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
const rpc = [];
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/upsert_agreement_parts/.test(r.url())) return;
  let t = '';
  try { t = (await r.text()).slice(0, 300); } catch {}
  rpc.push(`${r.status()} ${t.slice(0, 200)}`);
});

const rail = () => page.locator('nav[aria-label="Agreement parts"] li');
const pick = async (name) => {
  await rail().filter({ hasText: name }).first().locator('button').nth(1).click();
  await page.waitForTimeout(700);
};
const readiness = async (tag) =>
  console.log(`READINESS ${tag}: ` +
    (await page.$eval('section[aria-label="Agreement readiness"]', (n) => n.innerText)).replace(/\n+/g, ' | '));
const save = async (tag) => {
  rpc.length = 0;
  const btn = page.getByRole('button', { name: /^Save agreement$/ });
  if (!(await btn.count())) { console.log(`SAVE ${tag}: nothing dirty`); return; }
  if (await btn.first().isDisabled()) { console.log(`SAVE ${tag}: DISABLED`); return; }
  await btn.click();
  await page.waitForTimeout(4500);
  console.log(`SAVE ${tag}: ${JSON.stringify(rpc)} note=${JSON.stringify(
    await page.$$eval('[role="status"]', (ns) => ns.map((x) => x.innerText).filter(Boolean)))}`);
};
const railDump = async (tag) => {
  const rows = await rail().evaluateAll((ns) => ns.map((n) => n.innerText.split('\n')[1] ?? ''));
  console.log(`RAIL ${tag} (${rows.length}): ${rows.join(' · ')}`);
};

await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await rail().count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);
await railDump('start');

// the second role from the M2 probe is unsaved; reload dropped it. Probe the editor.
await pick('Role rates');
console.log('RATE CARD CONTROLS', JSON.stringify(
  await page.$$eval('section[aria-label$="editor"] button', (ns) => ns.map((n) => n.innerText.trim() || n.getAttribute('aria-label')))));

// ── step 6 · the role
const roleOne = page.getByLabel('Role 1', { exact: true });
if ((await roleOne.inputValue()) !== 'Principal designer') {
  await roleOne.fill('Principal designer');
  await page.getByLabel(/hourly rate/i).first().fill('225.00');
  await page.waitForTimeout(500);
}
await readiness('after role');
await save('after role');
await shot(page, 'r06-step6-role');

// ── step 7a · the ceiling
await pick('Ceiling');
const cb = page.locator('section[aria-label$="editor"] input[type="checkbox"]');
if (await cb.count()) {
  console.log('CEILING CHECKBOX checked=', await cb.first().isChecked());
  if (await cb.first().isChecked()) await cb.first().uncheck();
  await page.waitForTimeout(400);
}
await page.getByLabel(/Design authorization ceiling/i).fill('24000');
await page.waitForTimeout(600);
await readiness('after ceiling');
await save('after ceiling');

// ── step 5 · remove Exclusions
await rail().filter({ hasText: 'Exclusions' }).first()
  .getByRole('button', { name: /Part options for Exclusions/i }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Remove$/ }).first().click();
await page.waitForTimeout(700);
await save('after removing Exclusions');
await railDump('after remove');
await shot(page, 'r07-step5-exclusions-removed');

// ── step 7b · retainer 0, cadence untouched (M3 — Monthly already chosen), terms already written
await pick('Retainer');
await page.getByLabel(/Retainer · dollars/i).fill('0');
await page.waitForTimeout(500);
await save('after retainer');
await railDump('final');
await readiness('final');
await shot(page, 'r08-step7-ready-1280');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await shot(page, 'r08-step7-ready-390');
await b.close();
