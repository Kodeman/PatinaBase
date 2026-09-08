import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib2.mjs';

const P = '95390bd8-86e4-4a0b-9595-9dd5657cc51e';
const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));

await page.goto(`${DESIGNER}/drafting/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await dismissOverlays(page);
const frozen = await page.evaluate(() => {
  const send = document.querySelector('[data-action-key="review-design-agreement"]');
  const inputs = Array.from(document.querySelectorAll('input,select,textarea'));
  return {
    reviewAndSend: send
      ? { text: send.innerText.trim(), disabled: send.disabled, aria: send.getAttribute('aria-disabled') }
      : null,
    controls: inputs.length,
    enabled: inputs.filter((e) => !e.disabled).map((e) => `${e.tagName}:${e.getAttribute('aria-label') || e.id || ''}`),
    addButtons: Array.from(document.querySelectorAll('button'))
      .filter((b) => /^\+ Add/.test(b.innerText || ''))
      .map((b) => ({ t: b.innerText.trim(), disabled: b.disabled })),
    removeButtons: Array.from(document.querySelectorAll('button'))
      .filter((b) => /^Remove$/.test((b.innerText || '').trim()))
      .map((b) => ({ disabled: b.disabled })).slice(0, 4),
  };
});
console.log('FROZEN ROOM:', JSON.stringify(frozen, null, 1));
await shot(page, 'r2-14a-frozen-room');

// ── STEP 15 · countersign ────────────────────────────────────────────────
const doc = await ctx.newPage();
doc.on('response', async (r) => {
  const u = r.url();
  if (/rpc\//.test(u) && /countersign|sign/.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 400); } catch { /* body gone */ }
    console.log('NET', u.split('/').pop(), r.status(), b);
  }
});
await doc.goto(`${DESIGNER}/doc/${P}`, { waitUntil: 'domcontentloaded' });
await doc.waitForTimeout(12000);
await dismissOverlays(doc);
const cs = doc.getByRole('button', { name: /^Countersign agreement$/i }).first();
console.log('countersign button:', await cs.count());
await cs.click();
await doc.waitForTimeout(4000);
await shot(doc, 'r2-14b-countersign-sheet');
const dlg = await doc.evaluate(() => {
  const ds = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = ds[ds.length - 1];
  return d
    ? { text: d.innerText.slice(0, 2500), buttons: Array.from(d.querySelectorAll('button')).map((b) => b.innerText.trim().slice(0, 40)) }
    : null;
});
console.log('COUNTERSIGN SHEET:', JSON.stringify(dlg, null, 1));
const confirm = doc.getByRole('button', { name: /Countersign|Sign for the studio|Confirm/i }).last();
await confirm.click();
await doc.waitForTimeout(16000);
await shot(doc, 'r2-14c-after-countersign');
console.log('url after countersign:', doc.url());
console.log((await textOf(doc)).slice(0, 2500));
await browser.close();
