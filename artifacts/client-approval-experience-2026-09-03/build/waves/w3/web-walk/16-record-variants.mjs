import { open, signIn, shot, t, IDS, BASE } from './lib.mjs';
const { browser, ctx, page } = await open({ width: 1280, height: 1200 });
await signIn(page);
const cases = [
  ['returned-G8', 'eb18b8ad-c610-49f2-9a88-5d7afd81c277'],
  ['approved-in-browser-G2', IDS.g2pending],
  ['successor-open-no-answer', IDS.successor],
];
for (const [label, id] of cases) {
  await page.goto(`${BASE}/decisions/${id}/record`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log(`\n=== ${label} (${id})`);
  console.log(t(await page.evaluate(() => document.body.innerText)).slice(0, 900));
  const st = page.locator('[data-stamp-state]').first();
  console.log('stamp:', await st.count() ? await st.getAttribute('data-stamp-state') : '(none)');
  await shot(page, `18-record-${label}`, true);
}
// signed out
await ctx.clearCookies();
const resp = await page.goto(`${BASE}/decisions/${IDS.predecessor}/record`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
console.log('\n=== signed out ===');
console.log('http', resp && resp.status(), 'url', page.url());
console.log(t(await page.evaluate(() => document.body.innerText)).slice(0, 300));
await shot(page, '19-record-signed-out', false);
await browser.close();
