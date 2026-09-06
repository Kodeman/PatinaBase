/* W3-01 / W3-02, re-walked after the fix. Same rAF sampler as round 3's
   24-receipt-lifetime.mjs, scoped to one door section by id — but sampling
   for 20 s, long past the swing and the refetch that used to end the
   section, and watching the delivery block as well as the receipt. */
import { open, signIn, openHouse, t, holdPress } from '../web-walk-r3/lib.mjs';

const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r4';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

const sec = page
  .locator('[data-threshold-unit="door"]')
  .filter({ has: page.locator('[data-testid="door-way"]') })
  .first();
await sec.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const secId = await sec.getAttribute('id');
console.log('door:', t(await sec.locator('h2').innerText()), '| id:', secId);

const dw = sec.locator('[data-testid="door-way"]').first();
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
await dw.locator('input[type=text]').first().fill('Client User');
await dw.locator('input[type=checkbox]').first().check();
await page.waitForTimeout(250);

await page.evaluate((id) => {
  window.__r = [];
  const t0 = performance.now();
  const tick = () => {
    const s = document.getElementById(id);
    const rec = s?.querySelector('[data-testid="door-receipt"]');
    const del = s?.querySelector('[data-testid="door-delivery-pending"]');
    const leaf = s?.querySelector('[data-testid="door-leaf"]');
    window.__r.push({
      ms: Math.round(performance.now() - t0),
      sec: !!s,
      present: !!rec,
      op: rec ? Number(getComputedStyle(rec).opacity) : null,
      del: !!del,
      leaf: !!leaf,
    });
    if (performance.now() - t0 < 20000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, secId);

await holdPress(page, sign, 1400);
await page.waitForTimeout(1600);
await page.screenshot({ path: `${SH}/30-receipt-just-after.png` });
await page.waitForTimeout(19000);

const r = await page.evaluate(() => window.__r);
const span = (key) => {
  const on = r.filter((x) => x[key]);
  return on.length
    ? `${on[0].ms}ms → ${on[on.length - 1].ms}ms  (${on[on.length - 1].ms - on[0].ms}ms, ${on.length} frames)`
    : 'never';
};
const full = r.filter((x) => x.present && x.op >= 0.99);
console.log('sampled to       :', r[r.length - 1].ms, 'ms');
console.log('section present  :', span('sec'));
console.log('receipt present  :', span('present'));
console.log('receipt at op≥.99:', full.length ? `${full[0].ms}ms → ${full[full.length - 1].ms}ms  (${full[full.length - 1].ms - full[0].ms}ms)` : 'never');
console.log('delivery present :', span('del'));
console.log('leaf present     :', span('leaf'));
console.log('section gone at  :', (r.find((x) => !x.sec) || {}).ms ?? 'never');
console.log('receipt gone at  :', (r.find((x) => x.sec && !x.present) || {}).ms ?? 'never');

const after = await page.evaluate(() => ({
  seal: (document.body.innerText.match(/has your signature/gi) || []).length,
  sentence: (document.body.innerText.match(/confirmation delivery is still pending/gi) || []).length,
  resend: [...document.querySelectorAll('button')].filter((b) => /resend confirmation notice/i.test(b.textContent || '')).length,
  head: [...document.querySelectorAll('[data-threshold-unit="door"] p')].map((n) => n.textContent.trim()).slice(0, 3),
  counters: (document.documentElement.outerHTML.match(/countersign\w*/gi) || []).length,
  previously: [...document.querySelectorAll('[data-testid="previously-state"]')].map((n) => n.textContent.trim()).slice(0, 8),
  papers: [...document.querySelectorAll('#mat-papers a')].map((n) => n.textContent.trim()),
}));
console.log('after the refetch —', JSON.stringify(after, null, 1));
await page.screenshot({ path: `${SH}/31-receipt-20s-later.png` });

/* And it is still there after the page is worked: scroll away, scroll back. */
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1200);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1200);
const late = await page.evaluate(() => ({
  seal: (document.body.innerText.match(/has your signature/gi) || []).length,
  sentence: (document.body.innerText.match(/confirmation delivery is still pending/gi) || []).length,
}));
console.log('after scrolling the house:', JSON.stringify(late));
await page.screenshot({ path: `${SH}/32-after-scrolling.png` });
await browser.close();
