import { open, signIn, openHouse, shot, t, IDS } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const ids = (sel) => [...document.querySelectorAll(sel)].map((e) => e.id || e.getAttribute('data-testid'));
  const list = (sel) => [...document.querySelectorAll(sel)].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 180));
  return {
    asks: list('[data-testid="doorstep-approval"]'),
    askIds: ids('[data-testid="doorstep-approval"]'),
    anchors: [...document.querySelectorAll('[id^="approval-"]')].map((e) => e.id),
    records: document.querySelector('[data-testid="approval-records"]') ? 1 : 0,
    receipts: list('[data-testid="approval-receipt"]'),
    testids: [...new Set([...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))],
  };
});
console.log('ANCHORS:', JSON.stringify(info.anchors, null, 1));
console.log('\nASKS (', info.asks.length, '):');
info.asks.forEach((a, i) => console.log(' ', i, '::', a));
console.log('\nRECEIPTS (', info.receipts.length, '):');
info.receipts.forEach((a, i) => console.log(' ', i, '::', a));
console.log('\nTESTIDS:', JSON.stringify(info.testids));
await shot(page, '05-doorstep-1280', true);
await browser.close();
