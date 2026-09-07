/** r2 · P8 — fill ceiling / retainer / terms on the studio-defaults rate card, then send. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const proposalId = 'e2000000-0000-0000-0000-0000000000a2';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(upsert_agreement_parts|send_commercial)/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 140); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t.slice(0, 120));
});
const rail = () => page.locator('nav[aria-label="Agreement parts"] li');
const pick = async (n) => {
  await rail().filter({ hasText: n }).first().locator('button').nth(1).click();
  await page.waitForTimeout(700);
};
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await rail().count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);

await pick('Ceiling');
const cb = page.locator('section[aria-label$="editor"] input[type="checkbox"]');
if ((await cb.count()) && (await cb.first().isChecked())) await cb.first().uncheck();
await page.waitForTimeout(400);
await page.getByLabel(/Design authorization ceiling/i).fill('30000');
await page.waitForTimeout(400);
await pick('Retainer');
await page.getByLabel(/Retainer · dollars/i).fill('2500');
await page.waitForTimeout(400);
await pick('Terms');
await page.locator('section[aria-label$="editor"] textarea').first().fill(
  'Ownership of the design documents passes on final payment. Either party may end this agreement on fourteen days written notice.');
await page.waitForTimeout(600);
const save = page.getByRole('button', { name: /^Save agreement$/ });
console.log('SAVE disabled=', await save.first().isDisabled());
await save.click();
await page.waitForTimeout(6000);
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
