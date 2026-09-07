/** r2 · P3 (Birch Hollow, project-bound) — compose and send so the homeowner can read and sign. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const proposalId = 'e2000000-0000-0000-0000-0000000000a1';
const doSend = process.argv.includes('--send');
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 160); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t.slice(0, 140));
});
const rail = () => page.locator('nav[aria-label="Agreement parts"] li');
const pick = async (n) => {
  await rail().filter({ hasText: n }).first().locator('button').nth(1).click();
  await page.waitForTimeout(700);
};
const save = async (t) => {
  const btn = page.getByRole('button', { name: /^Save agreement$/ });
  if (!(await btn.count())) { console.log(`SAVE ${t}: not dirty`); return; }
  if (await btn.first().isDisabled()) { console.log(`SAVE ${t}: DISABLED`); return; }
  await btn.click(); await page.waitForTimeout(4500);
  console.log(`SAVE ${t}:`, JSON.stringify(
    await page.$$eval('[role="status"]', (ns) => ns.map((x) => x.innerText).filter(Boolean))));
};
const readiness = async (t) =>
  console.log(`READINESS ${t}: ` + (await page.$eval('section[aria-label="Agreement readiness"]',
    (n) => n.innerText)).replace(/\n+/g, ' | '));

await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await rail().count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);
console.log('RAIL', await rail().count());

await pick('Role rates');
await page.getByRole('button', { name: /\+ Add a role/ }).click();
await page.waitForTimeout(400);
await page.getByLabel('Role 1', { exact: true }).fill('Principal designer');
await page.getByLabel(/hourly rate/i).first().fill('225.00');
await page.waitForTimeout(500);

await pick('Ceiling');
const cb = page.locator('section[aria-label$="editor"] input[type="checkbox"]');
if ((await cb.count()) && (await cb.first().isChecked())) await cb.first().uncheck();
await page.waitForTimeout(400);
await page.getByLabel(/Design authorization ceiling/i).fill('24000');
await page.waitForTimeout(400);

await pick('Retainer');
await page.getByLabel(/Retainer · dollars/i).fill('0');
await page.waitForTimeout(400);

await pick('Terms');
await page.locator('section[aria-label$="editor"] textarea').first().fill(
  'Ownership of the design documents passes on final payment. Either party may end this agreement on fourteen days written notice.');
await page.waitForTimeout(500);
await save('P3 composed');
await readiness('P3');
await shot(page, 'r10-p3-composed-1280');

if (doSend) {
  await page.getByRole('button', { name: /review & send/i }).first().click();
  await page.waitForTimeout(3000);
  const sendBtn = page.getByRole('button', { name: /^Send agreement/ });
  console.log('SEND ENABLED:', !(await sendBtn.isDisabled()));
  await shot(page, 'r10-p3-send-sheet');
  await sendBtn.click();
  await page.waitForTimeout(9000);
  console.log('URL', page.url());
  await shot(page, 'r10-p3-sent');
}
await b.close();
