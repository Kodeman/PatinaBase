import { launch, shot, shot390, textOf, CLIENT } from './lib2.mjs';

const TOKEN = '7647f2577f6aa43254029ff015728529cbdbe1badd794a8af0755feddf2e2af0';
// A clean profile: no storage state, no Patina session of any kind.
const { browser, ctx } = await launch();
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  if (/rpc\/(resolve|sign)_trade/.test(r.url())) {
    let b = '';
    try { b = (await r.text()).slice(0, 500); } catch { /* body gone */ }
    console.log('NET', r.url().split('/rpc/')[1], r.status(), b);
  }
});
await page.goto(`${CLIENT}/trade/${TOKEN}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
const t = await textOf(page);
console.log('=== /trade/<token> — no login ===');
console.log(t);
await shot(page, 'r2-26a-trade-token');
await shot390(page, 'r2-26b-trade-token-390');

// what must NOT be on this page
const leaks = {
  clientName: /Client User/i.test(t),
  projectName: /Birch Hollow|Halvorsen/i.test(t),
  gmp: /84,134|GUARANTEED MAXIMUM/i.test(t),
  scheduleOfValues: /schedule of values/i.test(t),
  otherSub: /Electrical|Plumbing|Lighting|Tile/i.test(t),
  bid: /bid/i.test(t),
  drawFigures: /23,978|31,970|8,413/.test(t),
};
console.log('LEAKS:', JSON.stringify(leaks));
const dom = await page.content();
console.log('DOM mentions "bid":', /bid/i.test(dom.replace(/forbidden|forbid/gi, '')));
console.log('DOM mentions GMP cents 8413400:', dom.includes('8413400'));
console.log('DOM mentions another trade:', /Electrical|Lighting allowance/i.test(dom));

// sign once
const boxes = page.locator('input[type="checkbox"]');
for (let i = 0; i < (await boxes.count()); i += 1) {
  const b = boxes.nth(i);
  if (await b.isVisible()) await b.check().catch(() => {});
}
const name = page.locator('input[type="text"]').first();
if (await name.count()) await name.fill('Marta Reyes');
await page.waitForTimeout(600);
await shot(page, 'r2-26c-trade-form-filled');
const sign = page.getByRole('button', { name: /sign/i }).first();
console.log('sign button:', await sign.count(), 'disabled:', await sign.isDisabled().catch(() => 'n/a'));
const bb = await sign.boundingBox();
if (bb) {
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3500);
  await page.mouse.up();
} else {
  await sign.click();
}
await page.waitForTimeout(10000);
await shot(page, 'r2-26d-trade-signed');
console.log('\n=== AFTER SIGNING ===');
console.log((await textOf(page)).slice(0, 2000));

// the same URL, a second time
const p2 = await ctx.newPage();
await p2.goto(`${CLIENT}/trade/${TOKEN}`, { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(9000);
await shot(p2, 'r2-26e-trade-second-load');
const t2 = await textOf(p2);
console.log('\n=== THE SAME LINK, A SECOND TIME ===');
console.log(t2.slice(0, 1600));
console.log('second load offers a signable form:', (await p2.locator('input[type="text"]').count()) > 0);
await browser.close();
