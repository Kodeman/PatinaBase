import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib2.mjs';
const P = '95390bd8-86e4-4a0b-9595-9dd5657cc51e';
const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 400)));
page.on('response', async (r) => {
  const u = r.url();
  const n = u.split('/').pop();
  if (/trade/i.test(n)) {
    let b=''; try { b = (await r.text()).slice(0, 700); } catch {}
    console.log('NET', n, r.status(), b);
  }
});
await page.goto(`${DESIGNER}/drafting/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
await dismissOverlays(page);
await page.getByRole('button', { name: /New Trade Agreement/i }).first().click();
await page.waitForTimeout(3500);
await page.getByLabel('Search the rolodex').fill('Reyes');
await page.waitForTimeout(2500);
await shot(page, 'r2-25a-rolodex-found');
const pick = page.getByRole('button', { name: /Reyes Cabinetry/i }).first();
console.log('rolodex hit:', await pick.count());
await pick.click();
await page.waitForTimeout(1200);
await page.getByRole('textbox', { name: 'What this covers' }).fill('Cabinetry & millwork');
await page.getByRole('textbox', { name: 'Scope' }).fill('Fabricate and install the kitchen and mudroom cabinetry and millwork, per the issued drawings.');
await page.getByLabel('Price dollars').fill('38000');
await page.getByLabel('Retainage percent').fill('5');
await page.getByLabel('Starts on').fill('2026-10-01');
await page.getByLabel('Duration days').fill('21');
await page.getByLabel('Pay when paid days').fill('7');
const wo = await page.evaluate(() => Array.from(document.querySelector('select[aria-label="Lien waiver policy"]').options).map((o)=>`${o.value}=${o.text}`));
console.log('WAIVER POLICIES:', JSON.stringify(wo));
const cond = wo.find((o)=>/conditional.*uncond/i.test(o)) || wo[1];
await page.selectOption('select[aria-label="Lien waiver policy"]', cond.split('=')[0]);
await page.getByRole('textbox', { name: 'Sequencing' }).fill('After rough-in, before tile');
await page.locator('label', { hasText: 'certificate of insurance' }).locator('input[type="checkbox"]').check();
await page.waitForTimeout(800);
await shot(page, 'r2-25b-trade-form-filled');
await page.getByRole('button', { name: /Send to the trade/i }).click();
await page.waitForTimeout(14000);
await shot(page, 'r2-25c-trade-sent');
const right = await page.evaluate(() => {
  const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return m ? m.children[2].innerText : '';
});
console.log('=== TRADE AGREEMENTS ===');
console.log(right.split('TRADE AGREEMENTS')[1]?.split("THE CLIENT'S COPY")[0]);
await browser.close();
