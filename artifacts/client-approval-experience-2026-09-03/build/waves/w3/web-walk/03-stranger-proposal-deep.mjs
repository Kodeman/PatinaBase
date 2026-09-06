import { open, signIn, shot, t, BASE, IDS, SOLO } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1100 });
const netErr = [];
page.on('response', async (r) => {
  if (r.url().includes('get_client_commercial_document_bundle') || r.url().includes('rpc/')) {
    netErr.push(`${r.status()} ${r.url().split('/rpc/')[1] || r.url()}`);
  }
});
await signIn(page, SOLO);
await page.goto(`${BASE}/proposals/${IDS.signedProposal}/record`, { waitUntil: 'domcontentloaded' });
for (const wait of [2000, 5000, 10000, 15000]) {
  await page.waitForTimeout(wait === 2000 ? 2000 : 3000);
  const txt = t(await page.evaluate(() => document.body.innerText));
  const html = await page.content();
  console.log(`t≈${wait}ms  textLen=${txt.length}  spinner=${/animate-spin/.test(html)}  text="${txt.slice(0,160)}"`);
}
console.log('rpc responses:', JSON.stringify(netErr.slice(-8)));
await shot(page, '03b-stranger-proposal-blank', true);
// what does the owner-side error branch look like? Force a bogus id as the owner.
await browser.close();

const { browser: b2, page: p2 } = await open({ width: 1280, height: 1100 });
await signIn(p2);
await p2.goto(`${BASE}/proposals/00000000-0000-0000-0000-0000000000ff/record`, { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(6000);
console.log('owner bogus proposal id ->', t(await p2.evaluate(() => document.body.innerText)).slice(0, 200));
await p2.goto(`${BASE}/decisions/00000000-0000-0000-0000-0000000000ff/record`, { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(6000);
console.log('owner bogus decision id ->', t(await p2.evaluate(() => document.body.innerText)).slice(0, 200));
await shot(p2, '03c-owner-bogus-id', true);
await b2.close();
