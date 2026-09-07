/** (a) FLAG-OFF leg + (e) R17 co-member notice. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib.mjs';

const proposalId = process.argv[2];
const tag = process.argv[3] ?? 'wz';
const state = process.argv[4] ?? `${HERE}/state-designer.json`;
const b = await browser();
const c = await ctx(b, { storageState: state });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  if (!/agreement_parts|design_services_draft/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 220); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(22000);
console.log('URL', page.url());
console.log('COMPOSER RAIL PRESENT:', await page.locator('nav[aria-label="Agreement parts"]').count());
await shot(page, `${tag}-1280`);
const body = await page.evaluate(() => document.body.innerText);
console.log('--- ROOM ---\n' + body.slice(0, 1600));
console.log('SHELL COUNT:', await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find(
    (n) => n.children.length === 0 && /(facets written|parts need attention)/i.test(n.textContent || ''));
  return el ? el.textContent.trim() : null;
}));
console.log('STATUS LINES:', JSON.stringify(await page.$$eval('[role="status"],[role="alert"]', (ns) => ns.map((x) => x.innerText).filter(Boolean))));
console.log('SAVE BUTTONS:', JSON.stringify(await page.$$eval('button', (ns) =>
  ns.map((n) => ({ t: n.innerText.trim().slice(0, 40), d: n.disabled })).filter((x) => /save|review & send/i.test(x.t)))));
// The room's markup, for the byte-identity comparison
const html = await page.evaluate(() => {
  const h = document.querySelector('header.border-b');
  return h ? h.parentElement.outerHTML : document.body.outerHTML;
});
fs.writeFileSync(`${HERE}/${tag}-room.html`, html);
console.log('markup bytes:', html.length, '→', `${HERE}/${tag}-room.html`);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await shot(page, `${tag}-390`);
await b.close();
