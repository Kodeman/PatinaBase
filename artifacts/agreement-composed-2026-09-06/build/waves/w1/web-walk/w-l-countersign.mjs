/** Walk step 11 — countersign in the designer portal. */
import { browser, ctx, shot, HERE } from './lib.mjs';

const proposalId = process.argv[2];
const projectId = process.argv[3];
const tag = process.argv[4] ?? 'wl';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(countersign|sign_)/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 250); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/doc/${projectId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(16000);
await shot(page, `${tag}-doc-before-countersign`);
const acts = await page.$$eval('button,a', (ns) =>
  ns.map((n) => n.innerText.trim().slice(0, 45)).filter(Boolean));
console.log('ACTS', JSON.stringify(acts.filter((a) => /sign|agreement|contract|counters/i.test(a))));
const cs = page.getByRole('button', { name: /countersign/i }).first();
if (!(await cs.count())) {
  console.log('no countersign button on the doc page; text follows');
  console.log((await page.evaluate(() => document.body.innerText)).slice(0, 2000));
  await b.close();
  process.exit(0);
}
await cs.click();
await page.waitForTimeout(3000);
await shot(page, `${tag}-countersign-sheet`);
console.log('SHEET:', (await page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop();
  return (d ?? document.body).innerText;
})).slice(0, 1500));
console.log('CONTROLS:', JSON.stringify(await page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop() ?? document.body;
  return {
    inputs: [...d.querySelectorAll('input')].map((n) => ({ t: n.type, ph: n.placeholder, al: n.getAttribute('aria-label') })),
    buttons: [...d.querySelectorAll('button')].map((n) => ({ t: n.innerText.trim().slice(0, 40), d: n.disabled })),
  };
})));
await b.close();
