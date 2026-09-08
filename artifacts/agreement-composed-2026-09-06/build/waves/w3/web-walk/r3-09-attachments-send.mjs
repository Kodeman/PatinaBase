import { launch, shot, shot390, dismissOverlays, HERE } from './lib3.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/r3-room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\/send_commercial_document|functions\/v1\/proposal-send|rpc\/upsert_agreement_parts/.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 600); } catch { /* body gone */ }
    console.log('NET', u.split('/').pop(), r.status(), b);
  }
});
const right = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[2].innerText : '';
  });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await dismissOverlays(page);

// ── STEP 9 · the attachments strip ───────────────────────────────────────
console.log('=== STEP 9 · right rail ===');
console.log(await right());
await shot(page, 'r3-09a-attachments-rail');
const jur = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('div,section'));
  const el = els.find((d) => (d.innerText || '').trim().startsWith('JURISDICTION NOTICES'));
  return el ? el.outerHTML.slice(0, 3500) : 'NOT FOUND';
});
console.log('=== jurisdiction panel html ===');
console.log(jur);

// ── STEP 10 · the send sheet, then send ──────────────────────────────────
await page.locator('[data-action-key="review-design-agreement"]').click();
await page.waitForTimeout(3000);
await shot(page, 'r3-09b-send-sheet');
const dlg = await page.evaluate(() => {
  const ds = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = ds[ds.length - 1];
  return d
    ? {
        text: d.innerText,
        buttons: Array.from(d.querySelectorAll('button')).map((b) => ({
          t: b.innerText.trim().slice(0, 40),
          disabled: b.disabled,
        })),
      }
    : null;
});
console.log('=== SEND SHEET ===');
console.log(dlg?.text);
console.log('BUTTONS', JSON.stringify(dlg?.buttons));
await page.getByRole('button', { name: /Send agreement/ }).click();
await page.waitForTimeout(15000);
await shot(page, 'r3-09c-after-send');
console.log('url after send:', page.url());
console.log('=== page after send ===');
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 3000));
await browser.close();
