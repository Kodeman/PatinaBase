import { launch, shot, dismissOverlays, HERE } from './lib3.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/r3-services-draft-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  if (r.url().includes('/rest/v1/rpc/upsert_agreement_parts')) {
    let b = '';
    try { b = (await r.text()).slice(0, 400); } catch { /* gone */ }
    console.log('RPC upsert_agreement_parts ->', r.status(), b);
  }
});
const right = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[2].innerText : '';
  });
const centre = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[1].innerText : '';
  });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
await dismissOverlays(page);
const rail = await page.evaluate(() =>
  Array.from(document.querySelectorAll('nav[aria-label="Agreement parts"] button')).map((b) =>
    (b.innerText || '').replace(/\n/g, ' | ').trim(),
  ),
);
console.log('SERVICES RAIL:', JSON.stringify(rail, null, 1));
await shot(page, 'r3-42a-services-room');

// give the rate card a value, then hide it — R33/R39
await page.locator('nav[aria-label="Agreement parts"] button', { hasText: 'Role rates' }).first().click();
await page.waitForTimeout(1200);
console.log('\n=== ROLE RATES editor ===');
console.log((await centre()).slice(0, 1800));
const addRole = page.getByRole('button', { name: /\+ Add a role/i }).first();
if (await addRole.count()) {
  await addRole.click();
  await page.waitForTimeout(500);
  const roleInputs = page.locator('input[aria-label^="Role "]');
  console.log('role inputs:', await roleInputs.count());
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input,select')).map((e) => e.getAttribute('aria-label')).filter(Boolean),
  );
  console.log('LABELS:', JSON.stringify(labels));
}
await shot(page, 'r3-42b-role-rates');
console.log('\n=== readiness before hiding ===');
console.log((await right()).split('JURISDICTION')[0]);
const hide = page.locator('label', { hasText: 'Hidden from your client' }).first();
console.log('hide act on Role rates:', await hide.count());
if (await hide.count()) {
  await hide.locator('input[type="checkbox"]').check();
  await page.waitForTimeout(1800);
  console.log('\n=== readiness with the FEE hidden (R33) ===');
  console.log((await right()).split('JURISDICTION')[0]);
  await shot(page, 'r3-42c-fee-hidden');
}
await browser.close();
