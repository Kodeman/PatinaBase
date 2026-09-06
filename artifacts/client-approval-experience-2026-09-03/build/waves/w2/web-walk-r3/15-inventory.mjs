import { open, signIn, openHouse, t } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const qs = await page.locator('[data-testid="approval-question"]').allInnerTexts();
console.log('questions on the doorstep:', qs.length);
qs.forEach((q, i) => console.log(`  ${String(i).padStart(2)}  ${t(q).slice(0, 110)}`));
await browser.close();
