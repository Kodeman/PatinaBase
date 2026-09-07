/** (f) R24 — "Return to the seven facets" un-composes a draft; the seven-facet room saves again. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const proposalId = process.argv[2];
const tag = process.argv[3] ?? 'wr';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  if (!/agreement_parts|design_services_draft/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 200); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
console.log('COMPOSED RAIL:', await page.locator('nav[aria-label="Agreement parts"] li').count());
await shot(page, `${tag}-01-composed`);

await page.getByRole('button', { name: /Return to the seven facets/i }).click();
await page.waitForTimeout(6000);
await shot(page, `${tag}-02-returned-1280`);
console.log('AFTER RETURN — shell count:', await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find(
    (n) => n.children.length === 0 && /(facets written|parts need attention)/i.test(n.textContent || ''));
  return el ? el.textContent.trim() : null;
}));
console.log('BODY (head):\n' + (await page.evaluate(() => document.body.innerText)).slice(0, 1400));

// Now save from the seven-facet room.
const ta = page.locator('textarea').first();
await ta.fill('Interior design services for the walk — written in the seven-facet room after returning.');
await page.waitForTimeout(800);
const saveBtns = await page.$$eval('button', (ns) => ns.map((n) => ({ t: n.innerText.trim().slice(0, 40), d: n.disabled })).filter((x) => /save/i.test(x.t)));
console.log('SAVE BUTTONS:', JSON.stringify(saveBtns));
const sb = page.getByRole('button', { name: /^Save (agreement|the agreement|changes)/i }).first();
if (await sb.count()) {
  await sb.click();
  await page.waitForTimeout(5000);
  console.log('SAVE NOTE:', JSON.stringify(await page.$$eval('[role="status"],[role="alert"]', (ns) => ns.map((x) => x.innerText).filter(Boolean))));
}
await shot(page, `${tag}-03-saved-facets`);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
await shot(page, `${tag}-03-saved-facets-390`);
await b.close();
