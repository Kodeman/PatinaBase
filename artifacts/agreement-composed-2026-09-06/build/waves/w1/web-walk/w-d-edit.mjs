/** Walk steps 5, 6, 7 — remove Exclusions, add a role, fill the money. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib.mjs';

const { proposalId } = JSON.parse(fs.readFileSync(`${HERE}/state-walk.json`, 'utf8'));
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
const rail = () => page.locator('nav[aria-label="Agreement parts"] li');
const pick = async (i) => {
  await rail().nth(i).locator('button').nth(1).click();
  await page.waitForTimeout(700);
};
const readiness = async (tag) =>
  console.log(
    `READINESS ${tag}:\n` +
      (await page.$eval('section[aria-label="Agreement readiness"]', (n) => n.innerText)),
  );
const railDump = async (tag) => {
  const rows = await rail().evaluateAll((ns) =>
    ns.map((n) => n.innerText.replace(/\n+/g, ' | ')),
  );
  console.log(`RAIL ${tag} (${rows.length}): ` + rows.map((r) => r.split(' | ')[2]).join(' · '));
};
const save = async () => {
  const btn = page.getByRole('button', { name: /^Save agreement$/ });
  await btn.waitFor({ timeout: 15000 });
  await btn.click();
  await page.waitForTimeout(3500);
  const note = await page.$$eval('[role="status"]', (ns) => ns.map((n) => n.innerText));
  console.log('  SAVE NOTE:', JSON.stringify(note));
};

await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);
await railDump('before');

// ── Step 5 · Remove Exclusions
await rail().nth(2).getByRole('button', { name: /Part options for Exclusions/i }).click();
await page.waitForTimeout(400);
await shot(page, 'wd-step5-row-menu-1280');
await page.getByRole('button', { name: /^Remove$/ }).first().click();
await page.waitForTimeout(700);
await railDump('after remove');
await save();
await shot(page, 'wd-step5-exclusions-removed-1280');

// ── Step 6 · Add a role to the rate card
await pick(2); // Role rates is now index 2
console.log('EDITOR:', (await page.$eval('section[aria-label$="editor"]', (n) => n.innerText)).slice(0, 200));
await page.getByRole('button', { name: /\+ Add a role/ }).click();
await page.waitForTimeout(600);
await page.getByLabel('Role 1', { exact: true }).fill('Principal designer');
await page.waitForTimeout(400);
await page.getByLabel(/hourly rate/i).first().fill('225.00');
await page.waitForTimeout(600);
await readiness('after role');
await save();
await shot(page, 'wd-step6-role-added-1280');

// ── Step 7 · Ceiling, retainer, cadence, prose
await pick(3); // Ceiling
await page.getByLabel(/Design authorization ceiling/i).fill('24000');
await page.waitForTimeout(500);
await pick(5); // Retainer
await page.getByLabel(/Retainer · dollars/i).fill('0');
await page.waitForTimeout(500);
await pick(6); // Billing cadence
await page.locator('section[aria-label$="editor"] select').selectOption('biweekly');
await page.waitForTimeout(300);
await page.locator('section[aria-label$="editor"] select').selectOption('monthly');
await page.waitForTimeout(500);
await pick(7); // Terms
await page.locator('section[aria-label$="editor"] textarea').first()
  .fill('Ownership of the design documents, cancellation on fourteen days notice, and reimbursable expenses at cost.');
await page.waitForTimeout(500);
await readiness('after money');
await save();
await railDump('final');
await readiness('final');
await shot(page, 'wd-step7-ready-1280');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
await shot(page, 'wd-step7-ready-390');
await b.close();
