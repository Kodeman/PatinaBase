import { open, signIn, openHouse, shot, t, BASE, IDS } from './lib-r3.mjs';

/* Does the forward act on the THIRD record — the one whose successor the
   closed fold is hiding — actually take her anywhere? Fresh load each probe
   (a fragment-only navigation is same-document in Chromium; r1 advisory 3). */

const { browser, page } = await open({ height: 1400 });
await signIn(page);

await openHouse(page, '');
await page.waitForTimeout(1200);

const before = await page.evaluate(() => ({
  records: document.querySelectorAll('[id^="approval-record-"]').length,
  target: !!document.getElementById('approval-15018689-ccd7-46b1-a3e3-282b77bc090f'),
  foldAct: Array.from(document.querySelectorAll('button,a'))
    .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
    .filter((s) => /earlier approvals/i.test(s)),
}));
console.log('== landing, fold shut ==\n ', JSON.stringify(before));

const act = page.locator('[data-testid="approval-receipt-forward"]', {
  hasText: 'Review revised edition',
}).nth(1);
console.log('  second forward act href:', await act.getAttribute('href'));
await act.scrollIntoViewIfNeeded();
await act.click();
await page.waitForTimeout(2500);

const after = await page.evaluate(() => {
  const el = document.getElementById('approval-15018689-ccd7-46b1-a3e3-282b77bc090f');
  return {
    hash: location.hash,
    records: document.querySelectorAll('[id^="approval-record-"]').length,
    targetPresent: !!el,
    targetTop: el ? Math.round(el.getBoundingClientRect().top) : null,
    scrollY: Math.round(window.scrollY),
  };
});
console.log('== after clicking it ==\n ', JSON.stringify(after));
await shot(page, '15-forward-act-clicked');

/* And the control: a FRESH load addressing nothing. */
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await openHouse(page, '#approval-00000000-0000-0000-0000-000000000000');
await page.waitForTimeout(1200);
console.log(
  '== fresh load, an address that names nothing ==\n ',
  JSON.stringify(
    await page.evaluate(() => ({
      records: document.querySelectorAll('[id^="approval-record-"]').length,
      foldActs: Array.from(document.querySelectorAll('button,a'))
        .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
        .filter((s) => /earlier approvals/i.test(s)),
      scrollY: Math.round(window.scrollY),
    })),
  ),
);

await browser.close();
