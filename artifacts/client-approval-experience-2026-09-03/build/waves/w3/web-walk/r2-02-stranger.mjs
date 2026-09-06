import { open, signIn, shot, t, BASE, IDS, SOLO } from './lib-r2.mjs';

const { browser, page } = await open({ width: 1280, height: 900 });
const codes = [];
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/rest/v1/rpc/')) codes.push(`${r.status()} ${u.split('/rpc/')[1].split('?')[0]}`);
});

await signIn(page, SOLO);
console.log('signed in as', SOLO, '→', page.url());

for (const [label, url, n] of [
  ['stranger decision', `${BASE}/decisions/${IDS.predecessor}/record`, '03-stranger-decision'],
  ['stranger proposal', `${BASE}/proposals/${IDS.signedProposal}/record`, '03-stranger-proposal'],
]) {
  codes.length = 0;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  const timeline = [];
  for (const ms of [2000, 5000, 8000, 12000]) {
    while (Date.now() - t0 < ms) await page.waitForTimeout(200);
    timeline.push(`${ms}ms: "${t(await page.evaluate(() => document.body.innerText)).slice(0, 110)}"`);
  }
  console.log(`\n===== ${label}`);
  timeline.forEach((l) => console.log('  ', l));
  console.log('   stamps:', await page.locator('[data-stamp-state]').count());
  console.log('   rpc responses:', JSON.stringify(codes));
  await shot(page, n, false);
}

// owner reading an id that does not exist — non-enumeration
await browser.close();

const b2 = await open({ width: 1280, height: 900 });
await signIn(b2.page);
for (const [label, url] of [
  ['owner · bogus decision id', `${BASE}/decisions/00000000-0000-0000-0000-0000000000ff/record`],
  ['owner · bogus proposal id', `${BASE}/proposals/00000000-0000-0000-0000-0000000000ff/record`],
]) {
  await b2.page.goto(url, { waitUntil: 'domcontentloaded' });
  await b2.page.waitForTimeout(9000);
  console.log(`\n${label}: "${t(await b2.page.evaluate(() => document.body.innerText)).slice(0, 140)}"`);
}
await shot(b2.page, '03c-owner-bogus-id', false);

// signed out
await b2.ctx.clearCookies();
await b2.page.goto(`${BASE}/decisions/${IDS.predecessor}/record`, { waitUntil: 'domcontentloaded' });
await b2.page.waitForTimeout(4000);
console.log('\nsigned out →', b2.page.url());
await b2.browser.close();
