/** Open the composed body ("read it in full"), then optionally sign. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const tag = process.argv[2] ?? 'c04';
const doSign = process.argv.includes('--sign');
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-client.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(sign_|get_client_commercial)/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 200); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t);
});
await page.goto('http://localhost:3002/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);

await page.getByRole('button', { name: /READ IT IN FULL/i }).first().click();
await page.waitForTimeout(4000);
await shot(page, `${tag}-body-1280`);
console.log('--- BODY ---');
console.log(await page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop();
  return (d ?? document.body).innerText;
}));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await shot(page, `${tag}-body-390`);
await page.setViewportSize({ width: 1280, height: 900 });
await page.keyboard.press('Escape');
await page.waitForTimeout(1500);

if (doSign) {
  const name = page.locator('input[type="text"]').first();
  await name.fill('Client User');
  await page.waitForTimeout(500);
  const box = page.locator('input[type="checkbox"]');
  if (await box.count()) await box.first().check().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, `${tag}-signature-filled`);
  const signBtn = page.getByRole('button', { name: /SIGN AND ACCEPT/i }).first();
  console.log('SIGN DISABLED:', await signBtn.isDisabled());
  const bx = await signBtn.boundingBox();
  await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(4000);
  await page.mouse.up();
  await page.waitForTimeout(9000);
  await shot(page, `${tag}-after-sign`);
  console.log('--- AFTER SIGN ---');
  console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1200));
}
await b.close();
