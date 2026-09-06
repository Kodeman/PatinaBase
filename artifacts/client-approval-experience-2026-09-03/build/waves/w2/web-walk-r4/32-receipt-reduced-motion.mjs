/* The same measurement, but the sampler follows the SIGNED door by its own
   title rather than by `#door` — the page-level anchor moves to the next door
   still asking the moment this one is sealed, so an id-scoped sampler reads
   the wrong section (round 4, first pass). */
import { open, signIn, openHouse, t, holdPress } from '../web-walk-r3/lib.mjs';

const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r4';
const { browser, page } = await open({ width: 1280, height: 1100, motion: "reduce" });
await signIn(page);
await openHouse(page);

const sec = page
  .locator('[data-threshold-unit="door"]')
  .filter({ has: page.locator('[data-testid="door-way"]') })
  .first();
await sec.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const title = t(await sec.locator('h2').innerText());
const secId = await sec.getAttribute('id');
console.log('door:', title, '| id at the start:', secId);

const dw = sec.locator('[data-testid="door-way"]').first();
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
await dw.locator('input[type=text]').first().fill('Client User');
await dw.locator('input[type=checkbox]').first().check();
await page.waitForTimeout(250);

await page.evaluate((want) => {
  window.__r = [];
  const t0 = performance.now();
  const find = () =>
    [...document.querySelectorAll('[data-threshold-unit="door"]')].find(
      (s) => (s.querySelector('h2')?.textContent || '').replace(/\s+/g, ' ').trim() === want,
    ) || null;
  const tick = () => {
    const s = find();
    const rec = s?.querySelector('[data-testid="door-receipt"]');
    const del = s?.querySelector('[data-testid="door-delivery-pending"]');
    window.__r.push({
      ms: Math.round(performance.now() - t0),
      sec: !!s,
      id: s?.id ?? null,
      head: s ? (s.querySelectorAll('h2 ~ p, div > p')[0]?.textContent || '').trim().slice(0, 46) : null,
      present: !!rec,
      op: rec ? Number(getComputedStyle(rec).opacity) : null,
      text: rec ? rec.textContent.replace(/\s+/g, ' ').trim() : null,
      del: !!del,
      leaf: !!s?.querySelector('[data-testid="door-leaf"]'),
    });
    if (performance.now() - t0 < 25000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, title);

await holdPress(page, sign, 1400);
await page.waitForTimeout(24500);

const r = await page.evaluate(() => window.__r);
const span = (key) => {
  const on = r.filter((x) => x[key]);
  return on.length
    ? `${on[0].ms}ms → ${on[on.length - 1].ms}ms  (${on[on.length - 1].ms - on[0].ms}ms, ${on.length} frames)`
    : 'never';
};
console.log('sampled to      :', r[r.length - 1].ms, 'ms');
console.log('section present :', span('sec'));
console.log('receipt present :', span('present'));
console.log('delivery present:', span('del'));
console.log('leaf present    :', span('leaf'));
console.log('section gone at :', (r.find((x) => !x.sec) || {}).ms ?? 'never');
console.log('receipt gone at :', (r.find((x) => x.present === false && x.sec && r.some((y) => y.present && y.ms < x.ms)) || {}).ms ?? 'never');
const last = r[r.length - 1];
console.log('last frame      :', JSON.stringify({ ms: last.ms, id: last.id, head: last.head, op: last.op, del: last.del, leaf: last.leaf }));
console.log('receipt reads   :', last.text);
await page.screenshot({ path: `${SH}/34-signed-door-reduced.png` });
await browser.close();
