import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'Approve the guest bath vanity?');
await ask.scrollIntoViewIfNeeded();
const acts = ask.locator('[data-testid="approval-acts"]');
await acts.getByRole('button', { name: /^APPROVE$/i }).click();
await page.waitForTimeout(400);
await ask.locator('[data-testid="approval-signature"]').first().fill('Client User');
await page.waitForTimeout(200);
const submit = acts.getByRole('button', { name: /submit response/i }).first();
const stampCt = () => ask.locator('[data-testid="approval-stamp"]').count();

const b = await submit.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up();
console.log('quick tap -> stamps:', await stampCt());
// synthetic click ~150ms after the pointer gesture: INSIDE the 700ms tail
await page.waitForTimeout(150);
await submit.evaluate((el) => el.click());
await page.waitForTimeout(1500);
console.log('synthetic INSIDE tail (~150ms) -> stamps:', await stampCt(), '(0 = correctly refused)');
await ask.screenshot({ path: `${SH}/09-pointer-tail-refused.png` });
// now well outside the tail
await page.waitForTimeout(1500);
await submit.evaluate((el) => el.click());
await page.waitForTimeout(2800);
console.log('synthetic OUTSIDE tail -> stamps:', await stampCt(), t(await ask.locator('[data-testid="approval-stamp"]').first().textContent().catch(() => '')));
await browser.close();
