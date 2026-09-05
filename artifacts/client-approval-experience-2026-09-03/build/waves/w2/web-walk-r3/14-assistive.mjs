import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'plaster samples read warm');
await ask.scrollIntoViewIfNeeded();
const acts = ask.locator('[data-testid="approval-acts"]');
await acts.locator('button').filter({ hasText: 'APPROVE' }).first().click();
await page.waitForTimeout(300);
await ask.locator('[data-testid="approval-signature"]').fill('Client User');
const submit = acts.locator('button').filter({ hasText: /SUBMIT/i }).first();

// 1) a quick real pointer tap must not take
const box = await submit.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up();
await page.waitForTimeout(400);
console.log('quick real tap  — stamp ct:', await ask.locator('[data-testid="approval-stamp"]').count());

// 2) a synthetic click inside the pointer tail must be refused
await page.waitForTimeout(120);
await submit.evaluate((el) => el.click());
await page.waitForTimeout(1200);
console.log('synthetic in tail — stamp ct:', await ask.locator('[data-testid="approval-stamp"]').count());
await ask.screenshot({ path: `${SH}/14-pointer-tail-refused.png` });

// 3) a synthetic click well outside the tail is honoured
await page.waitForTimeout(1500);
await submit.evaluate((el) => el.click());
await page.waitForTimeout(2500);
console.log('synthetic outside — stamp:', t(await ask.locator('[data-testid="approval-stamp"]').first().textContent().catch(() => '(absent)')));
await ask.screenshot({ path: `${SH}/14b-assistive-approved.png` });
await browser.close();
