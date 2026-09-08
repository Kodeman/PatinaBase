import { launch, shot, shot390, textOf, CLIENT, HERE } from './lib3.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r3-client-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('request', (r) => {
  const u = r.url();
  if (/\/sign|rpc\/sign_/.test(u)) console.log('REQ', r.method(), u.replace(CLIENT, ''));
});
page.on('response', async (r) => {
  const u = r.url();
  if (/\/sign|rpc\/sign_/.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 700); } catch { /* body gone */ }
    console.log('NET', u.replace(CLIENT, ''), r.status(), b);
  }
});
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const boxes = page.locator('input[type="checkbox"]');
const n = await boxes.count();
for (let i = 0; i < n; i += 1) {
  const b = boxes.nth(i);
  if (await b.isVisible()) await b.check().catch(() => {});
}
await page.locator('input[type="text"]').first().fill('Client User');
await page.waitForTimeout(800);
await shot(page, 'r3-11a-sign-form');
const sign = page.getByRole('button', { name: /SIGN AND ACCEPT/i }).first();
const box = await sign.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(3500);
await page.mouse.up();
await page.waitForTimeout(11000);
await shot(page, 'r3-11b-after-sign');
console.log('=== AFTER SIGNING ===');
console.log((await textOf(page)).slice(0, 3500));

// STEP 13 · reload the door
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await shot(page, 'r3-11c-door-reloaded');
await shot390(page, 'r3-11d-door-reloaded-390');
console.log('\n=== THE DOOR, RELOADED ===');
console.log((await textOf(page)).slice(0, 3000));
await browser.close();
