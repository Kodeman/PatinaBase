/** r2 · P8 — name the second role the studio defaults left behind, then send. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const proposalId = 'e2000000-0000-0000-0000-0000000000a2';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(upsert_agreement_parts|send_commercial)/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 160); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t.slice(0, 140));
});
const rail = () => page.locator('nav[aria-label="Agreement parts"] li');
const pick = async (n) => {
  await rail().filter({ hasText: n }).first().locator('button').nth(1).click();
  await page.waitForTimeout(700);
};
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await rail().count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);

await pick('Role rates');
const names = page.getByLabel(/^Role \d+$/);
const n = await names.count();
console.log('ROLE FIELDS', n);
for (let i = 0; i < n; i++) {
  const v = await names.nth(i).inputValue();
  console.log(`  role ${i + 1} = ${JSON.stringify(v)}`);
  if (!v.trim()) {
    await names.nth(i).fill(`Junior designer ${i + 1}`);
    await page.waitForTimeout(300);
    await page.getByLabel(/hourly rate/i).nth(i).fill('120.00');
    await page.waitForTimeout(300);
  }
}
await page.waitForTimeout(600);
const save = page.getByRole('button', { name: /^Save agreement$/ });
if ((await save.count()) && !(await save.first().isDisabled())) {
  await save.click();
  await page.waitForTimeout(5000);
}
console.log('READINESS:', (await page.$eval('section[aria-label="Agreement readiness"]', (x) => x.innerText)).replace(/\n+/g, ' | '));
await shot(page, 'r25-p8-composed-1280');

await page.getByRole('button', { name: /review & send/i }).first().click();
await page.waitForTimeout(3500);
const sendBtn = page.getByRole('button', { name: /^Send agreement/ });
console.log('SEND ENABLED:', !(await sendBtn.isDisabled()));
await sendBtn.click();
await page.waitForTimeout(10000);
console.log('URL', page.url());
await shot(page, 'r25-p8-sent');
await b.close();
