import { open, signIn, openHouse, t } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const { browser, page } = await open({ width: 390, height: 844 });
await signIn(page);
await openHouse(page);
const sec = page.locator('[data-threshold-unit="door"]').filter({ has: page.locator('[data-testid="door-way"]') }).first();
const dw = sec.locator('[data-testid="door-way"]').first();
await dw.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
console.log('door:', t(await sec.locator('h2').innerText()));
await page.screenshot({ path: `${SH}/18-door-390-viewport.png` });

const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
await sign.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
console.log('\n--- acts vs 390x844 viewport, Sign in view ---');
for (const b of await dw.locator('button').all()) {
  const bb = await b.boundingBox();
  const pos = await b.evaluate((el) => { let n = el; while (n && n !== document.body) { const p = getComputedStyle(n).position; if (p === 'sticky' || p === 'fixed') return p; n = n.parentElement; } return 'static'; });
  const dock = await b.evaluate((el) => (el.closest('[data-acts-dock]') ? 'acts-dock' : el.closest('[data-hold-dock]') ? 'hold-dock' : '—'));
  console.log('  ', JSON.stringify(t(await b.innerText())).padEnd(26), 'y=', bb ? Math.round(bb.y) : null, 'h=', bb ? Math.round(bb.height) : null, 'inViewport=', bb ? (bb.y >= 0 && bb.y + bb.height <= 844) : null, 'pos=', pos.padEnd(7), dock);
}
const docks = await page.evaluate(() => {
  const a = document.querySelector('[data-acts-dock]'); const h = document.querySelector('[data-hold-dock]');
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), position: cs.position, bottomCss: cs.bottom }; };
  return { acts: r(a), hold: r(h) };
});
console.log('\ndocks:', JSON.stringify(docks));
await page.screenshot({ path: `${SH}/18b-door-390-acts.png` });
await browser.close();
