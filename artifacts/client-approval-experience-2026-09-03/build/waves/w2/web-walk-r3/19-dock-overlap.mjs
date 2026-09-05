import { open, signIn, openHouse, t } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const { browser, page } = await open({ width: 390, height: 844 });
await signIn(page);
await openHouse(page);
const sec = page.locator('[data-threshold-unit="door"]').filter({ has: page.locator('[data-testid="door-way"]') }).first();
const dw = sec.locator('[data-testid="door-way"]').first();
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
await sign.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
const r = await page.evaluate(() => {
  const acts = document.querySelector('[data-acts-dock]');
  const hold = document.querySelector('[data-hold-dock]');
  const btn = [...document.querySelectorAll('button')].find((b) => /SIGN AND AUTHORIZE/i.test(b.textContent || ''));
  const b = btn.getBoundingClientRect();
  const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}${e.className ? '.' + String(e.className).split(' ')[0] : ''}` : null; };
  return {
    actsZ: getComputedStyle(acts).zIndex, holdZ: getComputedStyle(hold).zIndex,
    actsRect: acts.getBoundingClientRect().toJSON(), holdRect: hold.getBoundingClientRect().toJSON(),
    signRect: b.toJSON(),
    hitTopEdge: hit(b.x + b.width / 2, b.y + 2),
    hitMid: hit(b.x + b.width / 2, b.y + b.height / 2),
    signInsideActsBox: b.y < acts.getBoundingClientRect().bottom,
  };
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: `${SH}/19-dock-overlap.png` });
// and the whole 390 ceremony shot: an open ask at 390
await browser.close();
