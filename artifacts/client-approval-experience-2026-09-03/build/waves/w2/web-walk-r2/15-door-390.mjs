import { open, signIn, openHouse, t } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r2';
const { browser, page } = await open({ width: 390, height: 844 });
await signIn(page);
await openHouse(page);
const dw = page.locator('[data-testid="door-way"]').first();
await dw.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
await dw.screenshot({ path: `${SH}/15-door-390.png` });
await page.screenshot({ path: `${SH}/15b-door-390-viewport.png` });
console.log('--- inputs on the leaf ---');
for (const i of await dw.locator('input').all()) console.log('  input type=', await i.getAttribute('type'), 'id=', await i.getAttribute('id'));
// Sticky dock? measure each act against the viewport with the sign act in view
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
await sign.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
console.log('--- acts vs 390x844 viewport, sign act in view ---');
for (const b of await dw.locator('button').all()) {
  const bb = await b.boundingBox();
  const pos = await b.evaluate((el) => { let n = el; while (n && n !== document.body) { const p = getComputedStyle(n).position; if (p === 'sticky' || p === 'fixed') return p; n = n.parentElement; } return 'static'; });
  console.log('  ', JSON.stringify(t(await b.innerText())).padEnd(24), 'y=', bb ? Math.round(bb.y) : null, 'visibleInViewport=', bb ? (bb.y >= 0 && bb.y + bb.height <= 844) : null, 'containerPos=', pos);
}
await page.screenshot({ path: `${SH}/15c-door-390-acts.png` });
await browser.close();
