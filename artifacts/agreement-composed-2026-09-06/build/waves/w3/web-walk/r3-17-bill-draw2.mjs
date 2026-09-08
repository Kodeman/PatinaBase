import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib3.mjs';

const P = '8cac8743-9b06-40ba-aeab-aa6a1829070b';
const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\//.test(u)) {
    const n = u.split('/rpc/')[1];
    if (/issue_agreement|record_agreement|trade/.test(n)) {
      let b = '';
      try { b = (await r.text()).slice(0, 600); } catch { /* body gone */ }
      console.log('NET', n, r.status(), b);
    }
  }
});
await page.goto(`${DESIGNER}/drafting/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
await dismissOverlays(page);

// ── STEP 15b · bill Rough-in ─────────────────────────────────────────────
const row = page.locator('li, div').filter({ hasText: 'Rough-in' });
const bill = page.getByRole('button', { name: /^Bill this draw$/ }).first();
await bill.click();
await page.waitForTimeout(3000);
const dlg = await page.evaluate(() => {
  const ds = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = ds[ds.length - 1];
  return d ? { text: d.innerText.slice(0, 1800), buttons: Array.from(d.querySelectorAll('button')).map((b) => b.innerText.trim().slice(0, 40)) } : null;
});
console.log('BILL SHEET:', JSON.stringify(dlg, null, 1));
await shot(page, 'r3-17a-bill-draw2-sheet');
if (dlg) {
  const go = page.getByRole('button', { name: /Issue|Bill|Send|Confirm/i }).last();
  await go.click();
  await page.waitForTimeout(12000);
}
await shot(page, 'r3-17b-draw2-billed');
const right = await page.evaluate(() => {
  const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return m ? m.children[2].innerText : '';
});
console.log('=== DRAWS after billing Rough-in ===');
console.log(right.split('DRAWS')[1]?.split('LIEN WAIVERS')[0]);
await browser.close();
