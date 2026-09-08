import { launch, shot, CLIENT, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/\/api\/proposals\/.*\/sign|rpc\/sign_/.test(u)) {
    let b = ''; try { b = (await r.text()).slice(0, 600); } catch {}
    console.log('NET', u.replace(CLIENT, ''), r.status(), b);
  }
});
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const boxes = page.locator('input[type="checkbox"]');
const n = await boxes.count();
console.log('checkboxes:', n);
for (let i = 0; i < n; i += 1) {
  const b = boxes.nth(i);
  if (await b.isVisible()) {
    await b.check().catch((e) => console.log('check fail', i, String(e).slice(0, 80)));
  }
}
const name = page.locator('input[type="text"]').first();
await name.fill('Client User');
await page.waitForTimeout(800);
await shot(page, '26a-sign-form-filled');

const sign = page.getByRole('button', { name: /SIGN AND ACCEPT/i }).first();
console.log('sign disabled?', await sign.isDisabled());
const box = await sign.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(3500);
await page.mouse.up();
await page.waitForTimeout(9000);
await shot(page, '26b-after-sign');
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 3000));
await browser.close();
