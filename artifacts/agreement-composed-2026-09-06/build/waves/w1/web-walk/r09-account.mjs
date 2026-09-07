/** r2 · (b) Account → Studio: the Agreement defaults card saves and re-reads; Billing untouched. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const mode = process.argv[2] ?? 'read';
const tag = process.argv[3] ?? 'r23';
const state = process.argv[4] ?? `${HERE}/r2-state-designer.json`;
const b = await browser();
const c = await ctx(b, { storageState: state });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/agreement_default/i.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 300); } catch {}
  console.log('  NET', r.request().method(), r.status(), t);
});
await page.goto('http://localhost:3000/desk', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
const skip = page.getByRole('button', { name: /skip for now/i });
if (await skip.count()) { await skip.first().click(); await page.waitForTimeout(1000); }
await page.evaluate(() =>
  window.dispatchEvent(new CustomEvent('document:open-account', { detail: { page: 'studio' } })));
await page.waitForTimeout(4000);
const addRole = page.getByRole('button', { name: /\+ Add a role/ });
await addRole.first().waitFor({ state: 'visible', timeout: 90000 }).catch(async () => {
  console.log('NO "+ Add a role". HEADINGS:', JSON.stringify(
    await page.$$eval('h2,h3', (ns) => ns.map((n) => n.innerText.trim()).filter(Boolean))));
  console.log('BUTTONS:', JSON.stringify(
    await page.$$eval('button', (ns) => ns.map((n) => n.innerText.trim().slice(0, 40)).filter(Boolean))));
});
await shot(page, `${tag}-account-studio-1280`);

const readState = async () => ({
  role1: await page.getByLabel('Default role 1', { exact: true }).inputValue().catch(() => null),
  rate1: await page.getByLabel('Default role 1 hourly rate').inputValue().catch(() => null),
  depositPressed: await page.$$eval('button', (ns) => ns.filter((n) => /^(0|25|50|100)%$/.test(n.innerText.trim())).map((n) => `${n.innerText.trim()}:${n.getAttribute('aria-pressed')}`)),
  creditPressed: await page.$$eval('button', (ns) => ns.filter((n) => /^(Credited|Non-refundable|Replenishing)$/.test(n.innerText.trim())).map((n) => `${n.innerText.trim()}:${n.getAttribute('aria-pressed')}`)),
  cadence: await page.locator('#studio-agreement-cadence').inputValue().catch(() => null),
  exclusions: await page.locator('textarea[placeholder^="Construction labor"]').inputValue().catch(() => null),
  cardFee: await page.locator('#studio-card-fee').inputValue().catch(() => null),
  remit: await page.locator('#studio-check-remit').inputValue().catch(() => null),
  saveDefaults: await page.getByRole('button', { name: /SAVE AGREEMENT DEFAULTS/i }).innerText().catch(() => null),
  saveDefaultsDisabled: await page.getByRole('button', { name: /SAVE AGREEMENT DEFAULTS/i }).isDisabled().catch(() => null),
  saveBilling: await page.getByRole('button', { name: /SAVE BILLING/i }).innerText().catch(() => null),
  saveBillingDisabled: await page.getByRole('button', { name: /SAVE BILLING/i }).isDisabled().catch(() => null),
});
console.log('BEFORE:', JSON.stringify(await readState()));

if (mode === 'save') {
  await addRole.first().click();
  await page.waitForTimeout(800);
  await page.getByLabel('Default role 1', { exact: true }).fill('Principal designer');
  await page.waitForTimeout(300);
  await page.getByLabel('Default role 1 hourly rate').fill('245');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^25%$/ }).click();
  await page.waitForTimeout(300);
  await page.locator('#studio-agreement-cadence').selectOption('biweekly');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Non-refundable$/ }).click();
  await page.waitForTimeout(300);
  await page.locator('textarea[placeholder^="Construction labor"]').fill('Construction labor\nPermits and approvals');
  await page.waitForTimeout(800);
  await shot(page, `${tag}-defaults-dirty`);
  const btn = page.getByRole('button', { name: /SAVE AGREEMENT DEFAULTS/i });
  console.log('SAVE DISABLED BEFORE CLICK:', await btn.isDisabled());
  await btn.click();
  await page.waitForTimeout(7000);
  console.log('AFTER SAVE:', JSON.stringify(await readState()));
  await shot(page, `${tag}-defaults-saved-1280`);
}
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await shot(page, `${tag}-account-studio-390`);
await b.close();
