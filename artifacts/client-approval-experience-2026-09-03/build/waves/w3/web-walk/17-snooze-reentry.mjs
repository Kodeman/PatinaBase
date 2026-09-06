import { open, signIn, openHouse, shot, t, IDS } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1200 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(3000);
const ask = page.locator(`#approval-${IDS.successor}`);
await ask.scrollIntoViewIfNeeded();
const sn = ask.locator('[data-testid="approval-snooze"]');
console.log('on re-entry (a sunday snooze already stands in decision_snoozes):');
console.log(' ', t(await sn.innerText()));
console.log(' said present:', await ask.locator('[data-testid="approval-snooze-said"]').count());
// press "Don't remind me"
await sn.getByRole('button', { name: /don.t remind me/i }).first().click();
await page.waitForTimeout(3500);
console.log("\nafter Don't remind me:");
console.log(' ', t(await sn.innerText()));
await shot(page, '20-snooze-never', false);
await browser.close();
