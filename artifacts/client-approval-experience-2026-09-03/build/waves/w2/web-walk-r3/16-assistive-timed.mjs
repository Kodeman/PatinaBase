import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'porch lantern samples');
await ask.scrollIntoViewIfNeeded();
const acts = ask.locator('[data-testid="approval-acts"]');
await acts.locator('button').filter({ hasText: 'APPROVE' }).first().click();
await page.waitForTimeout(300);
await ask.locator('[data-testid="approval-signature"]').fill('Client User');
const submit = acts.locator('button').filter({ hasText: /SUBMIT/i }).first();
const stampCt = () => ask.locator('[data-testid="approval-stamp"]').count();

// page-side clock so the tail is measured, not assumed. POINTER_TAIL_MS = 700.
await page.evaluate(() => {
  window.__marks = [];
  document.addEventListener('pointerup', () => window.__marks.push(['pointerup', Date.now()]), true);
});
const box = await submit.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up();
await page.waitForTimeout(300);
console.log('1) quick real tap (50ms)          — stamp ct:', await stampCt());

// 2) synthetic click INSIDE the 700ms tail — dispatched page-side so the delta is exact
const inTail = await submit.evaluate((el) => {
  const up = window.__marks.filter((m) => m[0] === 'pointerup').pop();
  const delta = up ? Date.now() - up[1] : -1;
  el.click();
  return delta;
});
console.log(`2) synthetic click at +${inTail}ms after pointerup (tail=700ms)`);
await page.waitForTimeout(1200);
console.log('   — stamp ct:', await stampCt());
await ask.screenshot({ path: `${SH}/16-pointer-tail-refused.png` });

// 3) synthetic click well OUTSIDE the tail
await page.waitForTimeout(1500);
const outTail = await submit.evaluate((el) => {
  const up = window.__marks.filter((m) => m[0] === 'pointerup').pop();
  const delta = up ? Date.now() - up[1] : -1;
  el.click();
  return delta;
});
console.log(`3) synthetic click at +${outTail}ms after pointerup`);
await page.waitForTimeout(2500);
console.log('   — stamp:', t(await ask.locator('[data-testid="approval-stamp"]').first().textContent().catch(() => '(absent)')));
await ask.screenshot({ path: `${SH}/16b-assistive-approved.png` });
await browser.close();
