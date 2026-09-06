import { open, signIn, shot, t, BASE, IDS, SOLO } from './lib-r3.mjs';

/* The second homeowner reads records that are not hers. `W3W-R1-04` asked for
   "This record could not be found." AT ONCE on both rails — the paper rail
   used to retry a 403 three times and then offer a refresh. */

const { browser, page } = await open();
const codes = [];
page.on('response', (r) => {
  if (r.url().includes('/rest/v1/rpc/')) codes.push(`${r.status()} ${r.url().split('/rpc/')[1]}`);
});
await signIn(page, SOLO);

async function timeToSentence(url, label) {
  codes.length = 0;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let said = null;
  const deadline = Date.now() + 20000;
  for (;;) {
    const body = t(await page.evaluate(() => document.body.innerText));
    if (/could not be/i.test(body)) {
      said = body.match(/This record could not be [^.]*\./i)?.[0] ?? body.slice(0, 120);
      break;
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(100);
  }
  const ms = Date.now() - t0;
  console.log(`\n== ${label} ==`);
  console.log('  sentence:', said);
  console.log('  settled in:', ms, 'ms');
  console.log('  rpc responses:', JSON.stringify(codes));
  return { said, ms };
}

await timeToSentence(`${BASE}/decisions/${IDS.predecessor}/record`, "stranger · another household's DECISION record");
await shot(page, '07-stranger-decision');
await timeToSentence(`${BASE}/proposals/${IDS.signedProposal}/record`, "stranger · another household's PROPOSAL record");
await shot(page, '08-stranger-proposal');

await browser.close();

/* Non-enumeration: the OWNER reading an id that does not exist must get the
   same sentence on the same route. */
const b2 = await open();
await signIn(b2.page);
const bogus = '00000000-0000-0000-0000-000000000000';
for (const [route, label] of [
  [`${BASE}/decisions/${bogus}/record`, 'owner · bogus decision id'],
  [`${BASE}/proposals/${bogus}/record`, 'owner · bogus proposal id'],
]) {
  await b2.page.goto(route, { waitUntil: 'domcontentloaded' });
  await b2.page.waitForTimeout(4000);
  const body = t(await b2.page.evaluate(() => document.body.innerText));
  console.log(`\n== ${label} ==\n  `, body.match(/This record could not be [^.]*\./i)?.[0] ?? body.slice(0, 140));
}
await shot(b2.page, '09-owner-bogus-id');

/* Signed out, the path is kept. */
await b2.ctx.clearCookies();
await b2.page.goto(`${BASE}/decisions/${IDS.predecessor}/record`, { waitUntil: 'domcontentloaded' });
await b2.page.waitForTimeout(3000);
console.log('\n== signed out ==\n  ', b2.page.url());
await b2.browser.close();
