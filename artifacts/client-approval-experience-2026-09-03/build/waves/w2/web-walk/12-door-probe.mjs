import { open, signIn, openHouse, t } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
for (const id of ['door-way','door-leaf','door-summary','door-receipt','door-lines','door-total','door-hint','door-note-pin','previously-line','previously-state','instrument-reading','wall-gate','scope-change-ask']) {
  const n = await page.locator(`[data-testid="${id}"]`).count();
  if (n) console.log(`${id}: ${n}`);
}
console.log('--- door text ---');
const dw = page.locator('[data-testid="door-way"]').first();
if (await dw.count()) {
  console.log(t(await dw.innerText()).slice(0, 900));
  await dw.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await dw.screenshot({ path: `${SH}/12-door-1280.png` });
}
console.log('--- previously ---');
for (const l of await page.locator('[data-testid="previously-line"]').all()) {
  console.log('  ', t(await l.innerText()).slice(0, 200));
}
await browser.close();
