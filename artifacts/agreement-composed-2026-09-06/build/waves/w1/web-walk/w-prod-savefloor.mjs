import { browser, ctx, shot, HERE } from './lib.mjs';
const id = process.argv[2];
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-prod.json` });
const page = await c.newPage();
page.on('response', async r => {
  if (!/upsert_agreement_parts/.test(r.url())) return;
  let t=''; try{t=(await r.text()).slice(0,220);}catch{}
  console.log('  RPC upsert', r.status(), t);
});
await page.goto(`http://localhost:3000/drafting/${id}`, { waitUntil: 'domcontentloaded' });
for (let i=0;i<40;i++){ if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(1500);}
await page.waitForTimeout(3000);
const rail = page.locator('nav[aria-label="Agreement parts"] li');
await rail.filter({hasText:'Terms'}).first().locator('button').nth(1).click();
await page.waitForTimeout(900);
await page.locator('section[aria-label$="editor"] textarea').first().fill('Ownership, cancellation, expenses.');
await page.waitForTimeout(900);
console.log('READINESS:', (await page.$eval('section[aria-label="Agreement readiness"]', n=>n.innerText)).replace(/\n+/g,' | '));
const btn = page.getByRole('button', { name: /^Save agreement$/ });
console.log('SAVE enabled:', !(await btn.isDisabled()));
await btn.click();
await page.waitForTimeout(5000);
console.log('SAVE NOTE:', JSON.stringify(await page.$$eval('[role="status"]', ns=>ns.map(x=>x.innerText).filter(Boolean))));
await shot(page, 'w-prod-savefloor');
await b.close();
