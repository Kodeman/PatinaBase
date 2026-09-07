import { browser, ctx, shot, HERE } from './lib2.mjs';
const proposalId = process.argv[2]; const tag = process.argv[3] ?? 'wt';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\//.test(r.url())) return;
  if (!/agreement_parts|design_services_draft/.test(r.url())) return;
  let t=''; try{t=(await r.text()).slice(0,220);}catch{}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
const ret = page.getByRole('button', { name: /Return to the seven facets/i });
if (await ret.count()) { await ret.click(); await page.waitForTimeout(6000); }
await page.getByLabel('Principal designer hourly rate').fill('195');
await page.waitForTimeout(400);
await page.getByLabel(/Design authorization ceiling/i).fill('18000');
await page.waitForTimeout(400);
await page.locator('textarea').first().fill('Interior design services written in the seven-facet room after returning from parts.');
await page.waitForTimeout(600);
console.log('SHELL:', await page.evaluate(() => {
  const el=[...document.querySelectorAll('*')].find(n=>n.children.length===0 && /(facets written|parts need attention)/i.test(n.textContent||''));
  return el?el.textContent.trim():null; }));
await page.getByRole('button', { name: /^Save agreement$/ }).click();
await page.waitForTimeout(6000);
console.log('SAVE NOTE:', JSON.stringify(await page.$$eval('[role="status"],[role="alert"]', ns=>ns.map(x=>x.innerText).filter(Boolean))));
await shot(page, `${tag}-facets-saved-1280`);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
await shot(page, `${tag}-facets-saved-390`);
await b.close();
