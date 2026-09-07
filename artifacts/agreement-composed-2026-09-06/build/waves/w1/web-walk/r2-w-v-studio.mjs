/** (b) Account → Studio: Agreement defaults saves and re-reads; Billing card unchanged. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const tag = process.argv[2] ?? 'wv';
const state = process.argv[3] ?? `${HERE}/r2-state-designer.json`;
const save = process.argv.includes('--save');
const b = await browser();
const c = await ctx(b, { storageState: state });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/agreement_default|studio_agreement/i.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 300); } catch {}
  console.log('  NET', r.url().split('/rest/v1/')[1]?.slice(0, 70), r.status(), t);
});
await page.goto('http://localhost:3000/desk', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const skip = page.getByRole('button', { name: /skip for now/i });
if (await skip.count()) { await skip.first().click(); await page.waitForTimeout(800); }
await page.evaluate(() =>
  window.dispatchEvent(new CustomEvent('document:open-account', { detail: { page: 'studio' } })));
await page.waitForTimeout(7000);
await shot(page, `${tag}-account-studio-1280`);
const txt = await page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop();
  return (d ?? document.body).innerText;
});
console.log('--- STUDIO PAGE ---\n' + txt.slice(2200, 6000));
console.log('CONTROLS:', JSON.stringify(await page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop() ?? document.body;
  return {
    inputs: [...d.querySelectorAll('input,textarea,select')].map((n) => ({
      tag: n.tagName, al: n.getAttribute('aria-label'), ph: n.placeholder, v: (n.value ?? '').slice(0, 30), dis: n.disabled })),
    buttons: [...d.querySelectorAll('button')].map((n) => ({ t: n.innerText.trim().slice(0, 40), d: n.disabled })),
  };
})));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await shot(page, `${tag}-account-studio-390`);
await b.close();
