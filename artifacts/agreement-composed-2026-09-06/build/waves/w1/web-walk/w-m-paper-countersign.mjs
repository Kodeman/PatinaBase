/** Walk steps 10-11 on the paper door: record the client's signature, countersign. */
import { browser, ctx, shot, HERE } from './lib.mjs';

const id = process.argv[2];
const tag = process.argv[3] ?? 'wm';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  if (!/sign|counter|paper|issue/i.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 300); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
const dialogText = () => page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop();
  return (d ?? document.body).innerText;
});
const dialogControls = () => page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop() ?? document.body;
  return {
    inputs: [...d.querySelectorAll('input,textarea')].map((n) => ({ t: n.type, ph: n.placeholder, al: n.getAttribute('aria-label') })),
    buttons: [...d.querySelectorAll('button')].map((n) => ({ t: n.innerText.trim().slice(0, 40), d: n.disabled })),
  };
});

await page.goto(`http://localhost:3000/doc/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(16000);
await page.getByRole('button', { name: /RECORD THE SIGNATURE/i }).first().click();
await page.waitForTimeout(2500);
await shot(page, `${tag}-record-sheet`);
console.log('SHEET:\n' + (await dialogText()).slice(0, 1500));
console.log('CONTROLS:', JSON.stringify(await dialogControls()));
await b.close();
