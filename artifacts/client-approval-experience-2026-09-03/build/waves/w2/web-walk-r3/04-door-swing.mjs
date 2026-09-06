import { open, signIn, openHouse, t, holdPress, shot } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const dw = page.locator('[data-testid="door-way"]').first();
await dw.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
await page.screenshot({ path: `${SH}/04-door-shut-1280.png` });
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
console.log('title           :', t(await page.locator('[data-threshold-unit="door"]').first().locator('h2').innerText()));
console.log('disabled, nothing      :', await sign.isDisabled());
await dw.locator('input[type=text]').first().fill('Client User');
await page.waitForTimeout(200);
console.log('disabled, name only    :', await sign.isDisabled());
await dw.locator('input[type=checkbox]').first().check();
await page.waitForTimeout(250);
console.log('disabled, name+consent :', await sign.isDisabled());
await page.screenshot({ path: `${SH}/05-door-armed.png` });

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
      leafTf: leaf ? getComputedStyle(leaf).transform.slice(0, 40) : null,
      rec: rec ? rec.textContent.trim() : null,
      recOp: rec ? getComputedStyle(rec).opacity : null,
      head: sec ? (sec.querySelector('p')?.textContent || '').trim().slice(0, 60) : null,
    });
    if (performance.now() - t0 < 8000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await holdPress(page, sign, 1400);
// mid-swing shot
await page.waitForTimeout(1150);
await page.screenshot({ path: `${SH}/06-door-swinging.png` });
await page.waitForTimeout(6000);
const f = await page.evaluate(() => window.__frames);
let last = '';
console.log('\n--- frame samples (change points) ---');
for (const x of f) {
  const key = `${x.sec}|${x.way}|${x.leafState}|${x.rec}|${x.recOp}|${x.head}`;
  if (key !== last) {
    console.log(`ms=${String(x.ms).padStart(4)} sec=${x.sec} way=${x.way} leaf=${x.leafState} tf=${x.leafTf} recOp=${x.recOp}\n           rec=${JSON.stringify(x.rec)}\n           head=${JSON.stringify(x.head)}`);
    last = key;
  }
}
// how long did `swinging` last, and how many distinct transforms were drawn?
const sw = f.filter((x) => x.leafState === 'swinging');
console.log(`\nswinging frames: ${sw.length}  span=${sw.length ? sw[sw.length-1].ms - sw[0].ms : 0}ms  distinct transforms=${new Set(sw.map((x)=>x.leafTf)).size}`);
console.log('open frames    :', f.filter((x) => x.leafState === 'open').length);
console.log('receipt frames :', f.filter((x) => x.rec).length, ' first at ms=', (f.find((x)=>x.rec)||{}).ms);

await page.screenshot({ path: `${SH}/07-door-open-after.png`, fullPage: false });
const rec = page.locator('[data-testid="door-receipt"]').first();
console.log('\nreceipt now    :', await rec.count(), JSON.stringify(t(await rec.textContent().catch(() => ''))));
console.log('head now       :', JSON.stringify(t(await page.locator('[data-threshold-unit="door"]').first().locator('p').first().innerText().catch(()=>''))));

// countersign sweep over the WHOLE rendered DOM
const cs = await page.evaluate(() => {
  const hay = document.body.innerText;
  const html = document.documentElement.outerHTML;
  const re = /countersign\w*/gi;
  return {
    inText: (hay.match(re) || []),
    inHtml: (html.match(re) || []).slice(0, 10),
    htmlCount: (html.match(re) || []).length,
  };
});
console.log('countersign in rendered TEXT:', cs.inText.length, JSON.stringify(cs.inText));
console.log('countersign in rendered HTML:', cs.htmlCount, JSON.stringify(cs.inHtml));
await browser.close();
