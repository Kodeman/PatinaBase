import { open, signIn, openHouse, shot, t, holdPress, BASE, IDS } from './lib-r3.mjs';

/* The phone measure, and the door's "Keep a copy" read off the ANCHOR rather
   than off the div that wraps it. */

const { browser, page } = await open({ width: 390, height: 844 });
await signIn(page);

await openHouse(page, '');
await page.waitForTimeout(1500);
await shot(page, '30-doorstep-390');

for (const [id, name] of [
  [IDS.successor, '31-successor-390'],
  [IDS.g6overdue, '32-past-due-390'],
]) {
  await page.locator(`#approval-${id}`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, name);
}

/* the door, on a phone: the leaf lifts on the vertical */
await openHouse(page, '#door');
await page.waitForTimeout(2000);
const door = page.getByTestId('door-way').first();
console.log('door-way on 390:', await page.getByTestId('door-way').count());
await door.scrollIntoViewIfNeeded();
await shot(page, '33-door-390');

await door.getByTestId('door-sign-name').fill('Client User');
await door.locator('input[type="checkbox"]').first().check();
await page.waitForTimeout(400);
await holdPress(page, door.getByRole('button', { name: /sign and accept/i }).first(), 2600);
await page.waitForTimeout(6000);

const keep = await page.evaluate(() => {
  const wrap = document.querySelector('[data-testid="door-keep-a-copy"]');
  const a = wrap?.querySelector('a');
  return a
    ? { text: a.textContent.trim(), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }
    : null;
});
console.log('receipt:', t(await page.getByTestId('door-receipt').first().innerText().catch(() => '(none)')));
console.log('keep-a-copy anchor:', JSON.stringify(keep));
await shot(page, '34-door-receipt-390');

/* and the same act on the answered approvals */
await openHouse(page, '');
await page.waitForTimeout(1500);
const approvalKeeps = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a'))
    .filter((a) => /keep a copy/i.test(a.textContent))
    .map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })),
);
console.log('every "Keep a copy" on the doorstep:', JSON.stringify(approvalKeeps, null, 1));

await shot(page, '35-records-390');
await browser.close();
