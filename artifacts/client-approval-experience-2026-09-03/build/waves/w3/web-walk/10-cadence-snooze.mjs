import { open, signIn, openHouse, shot, t, IDS, BASE } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(2000);

// ---- change the cadence
await page.locator('[data-testid="mat-details"]').getByText(/YOUR DETAILS/i).first().click();
await page.waitForTimeout(3000);
const weekly = page.locator('input[value="weekly_sunday"]').first();
await weekly.scrollIntoViewIfNeeded();
await weekly.click();
await page.waitForTimeout(3500);
console.log('weekly checked:', await weekly.isChecked());
await shot(page, '09-cadence-weekly-chosen', false);
// any save state / error?
const near = await page.evaluate(() => {
  const r = document.querySelector('input[value="weekly_sunday"]');
  const p = r.closest('section') || r.parentElement.parentElement.parentElement.parentElement;
  return (p.innerText || '').replace(/\s+/g,' ').trim().slice(-500);
});
console.log('cadence section tail:', near);

// close the sheet
await page.getByRole('button', { name: /shut/i }).first().click().catch(()=>{});
await page.waitForTimeout(1500);

// ---- snooze on the open successor ask
await openHouse(page);
await page.waitForTimeout(2500);
const ask = page.locator(`#approval-${IDS.successor}`);
await ask.scrollIntoViewIfNeeded();
const snooze = ask.locator('[data-testid="approval-snooze"]');
console.log('\nsnooze block:', t(await snooze.innerText()));
await shot(page, '10-snooze-acts', false);
const sunday = snooze.getByRole('button', { name: /^sunday$/i }).first();
await sunday.click();
await page.waitForTimeout(3500);
console.log('after click:', t(await snooze.innerText()));
const said = ask.locator('[data-testid="approval-snooze-said"]');
console.log('said:', await said.count() ? t(await said.first().innerText()) : '(none)');
await shot(page, '11-snooze-said', false);

// ---- past-due approval carries no snooze
const pd = page.locator(`#approval-${IDS.g6overdue}`);
await pd.scrollIntoViewIfNeeded();
console.log('\npast-due ask snooze count:', await pd.locator('[data-testid="approval-snooze"]').count());
const pdNote = pd.locator('[data-testid="approval-snooze-past-due"]');
console.log('past-due sentence:', await pdNote.count() ? t(await pdNote.first().innerText()) : '(none)');
await shot(page, '12-past-due-no-snooze', false);
await browser.close();
