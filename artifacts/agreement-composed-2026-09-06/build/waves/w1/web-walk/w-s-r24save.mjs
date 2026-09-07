/** (f) R24, second half — after returning, the seven-facet room saves. */
import { browser, ctx, shot, HERE } from './lib.mjs';

const proposalId = process.argv[2];
const tag = process.argv[3] ?? 'ws';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  if (!/agreement_parts|design_services_draft/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 220); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
const ret = page.getByRole('button', { name: /Return to the seven facets/i });
if (await ret.count()) { await ret.click(); await page.waitForTimeout(6000); }

console.log('LABELS:', JSON.stringify(await page.$$eval('label,input,textarea', (ns) =>
  ns.map((n) => n.tagName === 'LABEL' ? `L:${n.textContent.trim().slice(0, 34)}` : `${n.tagName}:${n.getAttribute('aria-label') ?? n.placeholder ?? ''}`.slice(0, 44)))));
await page.locator('textarea').first().fill('Interior design services written in the seven-facet room after returning from parts.');
await page.waitForTimeout(500);
const addRole = page.getByRole('button', { name: /\+ Add a role/ });
if (await addRole.count()) { await addRole.first().click(); await page.waitForTimeout(800); }
console.log('AFTER ADD ROLE inputs:', JSON.stringify(await page.$$eval('input', (ns) =>
  ns.map((n) => ({ al: n.getAttribute('aria-label'), ph: n.placeholder, v: n.value })).slice(0, 14))));
await shot(page, `${tag}-facets-filled`);
await b.close();
