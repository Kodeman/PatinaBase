import { open, signIn, openHouse, t, IDS } from './lib-r2.mjs';
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(4000);
const pd = page.locator(`#approval-${IDS.g6overdue}`);
await pd.scrollIntoViewIfNeeded();
console.log('===== the whole past-due card\n' + t(await pd.innerText()));
const dates = await pd.evaluate((el) =>
  [...el.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && /due/i.test(e.innerText || ''))
    .map((e) => ({ tag: e.tagName, testid: e.getAttribute('data-testid'), text: e.innerText.replace(/\s+/g, ' ').trim(), color: getComputedStyle(e).color }))
);
console.log('\nleaf nodes mentioning "due":', JSON.stringify(dates, null, 1));

// the standing snooze honesty rule: a hold whose hour has passed
console.log('\n===== reload after the stored hold is set into the past');
await browser.close();
