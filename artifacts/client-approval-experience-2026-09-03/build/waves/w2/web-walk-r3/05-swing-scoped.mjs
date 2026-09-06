import { open, signIn, openHouse, t, holdPress } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const TARGET = process.argv[2] || 'Stair and rail';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

// pick the door section whose h2 names TARGET
const sec = page.locator('[data-threshold-unit="door"]').filter({ has: page.locator(`h2:has-text("${TARGET}")`) }).first();
await sec.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
const secId = await sec.getAttribute('id');
console.log('target section id:', secId, '| head:', t(await sec.locator('p').first().innerText()));
const dw = sec.locator('[data-testid="door-way"]').first();
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
await dw.locator('input[type=text]').first().fill('Client User');
await dw.locator('input[type=checkbox]').first().check();
await page.waitForTimeout(250);

await page.evaluate((id) => {
  window.__f = [];
  const t0 = performance.now();
  const tick = () => {
    const s = document.getElementById(id);
    const leaf = s?.querySelector('[data-testid="door-leaf"]');
    const rec = s?.querySelector('[data-testid="door-receipt"]');
    window.__f.push({
      ms: Math.round(performance.now() - t0),
      sec: !!s,
      way: !!s?.querySelector('[data-testid="door-way"]'),
      st: leaf ? leaf.getAttribute('data-door-state') : null,
      tf: leaf ? getComputedStyle(leaf).transform.slice(0, 30) : null,
      maxh: s?.querySelector('[data-testid="door-way"]') ? getComputedStyle(s.querySelector('[data-testid="door-way"]')).maxHeight : null,
      rec: rec ? rec.textContent.trim().slice(0, 130) : null,
      op: rec ? getComputedStyle(rec).opacity : null,
      head: s ? (s.querySelector('p')?.textContent || '').trim().slice(0, 60) : null,
      nDoors: document.querySelectorAll('[data-threshold-unit="door"]').length,
    });
    if (performance.now() - t0 < 9000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, secId);

await holdPress(page, sign, 1400);
await page.waitForTimeout(1150);
await page.screenshot({ path: `${SH}/08-swing-mid-scoped.png` });
await page.waitForTimeout(7200);
const f = await page.evaluate(() => window.__f);
let last = '';
console.log('\n--- change points, scoped to that one section ---');
for (const x of f) {
  const k = `${x.sec}|${x.way}|${x.st}|${x.rec}|${x.op}|${x.head}|${x.nDoors}`;
  if (k !== last) {
    console.log(`ms=${String(x.ms).padStart(4)} sec=${x.sec} way=${x.way} st=${x.st} tf=${x.tf} maxh=${x.maxh} op=${x.op} doors=${x.nDoors}\n   rec=${JSON.stringify(x.rec)}\n   head=${JSON.stringify(x.head)}`);
    last = k;
  }
}
const states = {};
for (const x of f) states[String(x.st)] = (states[String(x.st)] || 0) + 1;
console.log('\nleaf state frame counts:', JSON.stringify(states));
const sw = f.filter((x) => x.st === 'swinging');
console.log(`swinging span=${sw.length ? sw[sw.length-1].ms - sw[0].ms : 0}ms frames=${sw.length} distinctTransforms=${new Set(sw.map(x=>x.tf)).size}`);
const op = f.filter((x) => x.st === 'open');
console.log(`open span=${op.length ? op[op.length-1].ms - op[0].ms : 0}ms frames=${op.length}`);
console.log('section gone at ms=', (f.find((x) => !x.sec) || {}).ms ?? 'never');
console.log('receipt frames=', f.filter(x=>x.rec).length, 'first ms=', (f.find(x=>x.rec)||{}).ms, 'last ms=', ([...f].reverse().find(x=>x.rec)||{}).ms);
await page.screenshot({ path: `${SH}/09-after-swing-scoped.png`, fullPage: true });
const cs = await page.evaluate(() => (document.documentElement.outerHTML.match(/countersign\w*/gi) || []));
console.log('countersign in DOM after:', cs.length, JSON.stringify(cs.slice(0,5)));
await browser.close();
