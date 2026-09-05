import { open, signIn, openHouse, t, holdPress } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r2';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const dw = page.locator('[data-testid="door-way"]').first();
await dw.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
await dw.locator('input[type=text]').first().fill('Client User');
await dw.locator('input[type=checkbox]').first().check();
await page.waitForTimeout(200);
await page.evaluate(() => {
  window.__frames = [];
  const t0 = performance.now();
  const tick = () => {
    const sec = document.querySelector('[data-threshold-unit="door"]');
    const leaf = document.querySelector('[data-testid="door-leaf"]');
    const rec = document.querySelector('[data-testid="door-receipt"]');
    window.__frames.push({
      ms: Math.round(performance.now() - t0),
      sec: !!sec,
      way: !!document.querySelector('[data-testid="door-way"]'),
      leafState: leaf ? leaf.getAttribute('data-door-state') : null,
      leafTf: leaf ? getComputedStyle(leaf).transform.slice(0, 34) : null,
      rec: rec ? rec.textContent.trim() : null,
      recOp: rec ? getComputedStyle(rec).opacity : null,
      head: sec ? (sec.querySelector('p')?.textContent || '').trim().slice(0, 42) : null,
    });
    if (performance.now() - t0 < 7000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await holdPress(page, sign, 1400);
await page.waitForTimeout(6500);
const f = await page.evaluate(() => window.__frames);
let last = '';
for (const x of f) {
  const key = `${x.sec}|${x.way}|${x.leafState}|${x.rec}|${x.recOp}|${x.head}`;
  if (key !== last) { console.log(`ms=${String(x.ms).padStart(4)} sec=${x.sec} way=${x.way} leaf=${x.leafState} tf=${x.leafTf} recOp=${x.recOp} rec=${JSON.stringify(x.rec)} head=${JSON.stringify(x.head)}`); last = key; }
}
await page.screenshot({ path: `${SH}/18-after-swing.png`, fullPage: true });
console.log('sections now:', await page.locator('[data-threshold-unit="door"]').count());
await browser.close();
