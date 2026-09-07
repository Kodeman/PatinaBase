/** Re-attach the client account through the room's own picker, then send. */
import { browser, ctx, shot, HERE } from './lib.mjs';

const proposalId = process.argv[2];
const tag = process.argv[3];
const doSend = process.argv.includes('--send');
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 200); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);

const picker = page.getByRole('combobox', { name: /Client account/i });
await picker.click();
await page.waitForTimeout(1200);
await page.getByRole('option', { name: /Client User/i }).first().click();
await page.waitForTimeout(4000);
console.log('CLIENT NOTE:', JSON.stringify(
  await page.$$eval('[role="status"],[role="alert"]', (ns) => ns.map((x) => x.innerText).filter(Boolean))));
await shot(page, `${tag}-client-attached`);

if (doSend) {
  await page.getByRole('button', { name: /review & send/i }).first().click();
  await page.waitForTimeout(3000);
  const sendBtn = page.getByRole('button', { name: /^Send agreement/ });
  console.log('SEND ENABLED:', !(await sendBtn.isDisabled()));
  await shot(page, `${tag}-send-sheet`);
  await sendBtn.click();
  await page.waitForTimeout(9000);
  await shot(page, `${tag}-after-send`);
  console.log('URL', page.url());
}
await b.close();
