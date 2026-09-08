import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib2.mjs';
import fs from 'node:fs';

const P = '95390bd8-86e4-4a0b-9595-9dd5657cc51e';
const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\/countersign|rpc\/sign_|rpc\/issue_agreement/.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 500); } catch { /* body gone */ }
    console.log('NET', u.split('/').pop(), r.status(), b);
  }
});

// W3R1-01 — the Contract Room at client_signed
await page.goto(`${DESIGNER}/drafting/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await dismissOverlays(page);
console.log('room url at client_signed:', page.url());
await shot(page, 'r2-13a-room-client-signed');
const roomText = await textOf(page);
console.log('=== THE ROOM AT client_signed ===');
console.log(roomText.slice(0, 4000));
console.log('\nroom carries DRAWS ledger:', /DRAWS/.test(roomText));
console.log('room carries TRADE AGREEMENTS:', /TRADE AGREEMENTS/.test(roomText));

// the document itself
const doc = await ctx.newPage();
await doc.goto(`${DESIGNER}/doc/${P}`, { waitUntil: 'domcontentloaded' });
await doc.waitForTimeout(12000);
await dismissOverlays(doc);
await shot(doc, 'r2-13b-doc-client-signed');
const dt = await textOf(doc);
console.log('\n=== /doc AT client_signed ===');
console.log(dt.slice(0, 3000));
const acts = await doc.evaluate(() =>
  Array.from(document.querySelectorAll('[data-action-key]')).map((e) => ({
    key: e.getAttribute('data-action-key'),
    text: (e.innerText || '').trim().slice(0, 60),
    disabled: e.disabled ?? null,
  })),
);
console.log('ACTS:', JSON.stringify(acts, null, 1));
await browser.close();
fs.writeFileSync(`${HERE}/r2-proposal-id.txt`, P);
