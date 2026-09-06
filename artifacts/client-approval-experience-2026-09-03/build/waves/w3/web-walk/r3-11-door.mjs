import { open, signIn, openHouse, shot, t, holdPress, BASE, IDS } from './lib-r3.mjs';

/* THE DOOR — unreachable on the last three walks because the seed carried no
   unsigned commercial instrument. `seed-r3.sql` puts one on the mat: a service
   addendum in `sent`. Swing it, read the receipt, and follow "Keep a copy". */

const { browser, page } = await open({ height: 1400 });
page.on('response', async (r) => {
  if (r.url().includes('/api/proposals/')) {
    let body = '';
    try { body = (await r.text()).slice(0, 300); } catch {}
    console.log('  [net]', r.status(), r.url().split('/api/')[1], body);
  }
});
await signIn(page);
await openHouse(page, '#door');
await page.waitForTimeout(2500);

const door = page.getByTestId('door-way').first();
console.log('== the door ==');
console.log('  door-gate count:', await page.getByTestId('door-way').count());
if ((await page.getByTestId('door-way').count()) === 0) {
  console.log('  body:', t(await page.evaluate(() => document.body.innerText)).slice(0, 600));
  await shot(page, '25-door-absent', true);
  await browser.close();
  process.exit(0);
}
await door.scrollIntoViewIfNeeded();
console.log('  leaf text:', t(await door.innerText()).replace(/\n/g, ' | ').slice(0, 700));
await shot(page, '25-door-shut');

console.log('  testids inside the doorway:', JSON.stringify(await door.evaluate((el) =>
  Array.from(el.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('testid') || e.getAttribute('data-testid')))));
console.log('  inputs:', JSON.stringify(await door.evaluate((el) =>
  Array.from(el.querySelectorAll('input')).map((i) => ({ testid: i.getAttribute('data-testid'), type: i.type, ph: i.placeholder })))));
console.log('  buttons:', JSON.stringify(await door.evaluate((el) =>
  Array.from(el.querySelectorAll('button')).map((b) => b.textContent.replace(/\s+/g,' ').trim()))));
const consent = door.locator('input[type="checkbox"]').first();
const name = door.getByTestId('door-sign-name');
const sign = door.getByRole('button', { name: /sign|accept|agree/i }).first();
console.log('  act label:', t(await sign.innerText()));
console.log('  disabled before the name:', await sign.isDisabled());
await name.fill('Client User');
await page.waitForTimeout(300);
console.log('  disabled with the name but no consent tick:', await sign.isDisabled());
await consent.check();
await page.waitForTimeout(500);
console.log('  disabled after name + consent:', await sign.isDisabled());
await shot(page, '26-door-signed-name');

await sign.click({ force: true });
await page.waitForTimeout(900);
console.log('  after a plain click, receipt yet:', await page.getByTestId('door-receipt').count());

await holdPress(page, sign, 2600);
await page.waitForTimeout(1200);
await shot(page, '27-door-mid-swing');
await page.waitForTimeout(5000);

const receipt = page.getByTestId('door-receipt').first();
console.log('\n== the receipt ==');
console.log('  door-receipt count:', await page.getByTestId('door-receipt').count());
console.log('  receipt:', t(await receipt.innerText().catch(() => '(none)')).replace(/\n/g, ' | '));
const keep = page.getByTestId('door-keep-a-copy').first();
console.log('  keep-a-copy count:', await page.getByTestId('door-keep-a-copy').count());
console.log('  doorway now:', t(await door.innerText().catch(() => '(gone)')).replace(/\n/g, ' | ').slice(-700));
if (await page.getByTestId('door-keep-a-copy').count()) {
  console.log('  keep-a-copy:', t(await keep.innerText()), '→', await keep.getAttribute('href'),
    '· target', await keep.getAttribute('target'), '· rel', await keep.getAttribute('rel'));
}
await shot(page, '28-door-receipt');

/* the record the door's own act leaves behind */
await page.goto(`${BASE}/proposals/${IDS.doorProposal}/record`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('record-signature').waitFor({ state: 'visible', timeout: 60000 });
console.log('\n== the record the door produced ==');
console.log('  signature block:', JSON.stringify(await page.getByTestId('record-signature')
  .evaluate((el) => Array.from(el.querySelectorAll('p')).map((p) => p.textContent.replace(/\s+/g, ' ').trim()))));
console.log('  stamp:', t(await page.getByTestId('record-stamp').first().innerText()).replace(/\n/g, ' | '));
await shot(page, '29-door-record');

await browser.close();
