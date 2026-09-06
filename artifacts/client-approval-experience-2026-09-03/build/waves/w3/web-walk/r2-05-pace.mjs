import { open, signIn, openHouse, shot, t, IDS } from './lib-r2.mjs';

const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);

// ── 1 · W3W-R1-02 · does the standing snooze survive re-entry?
await openHouse(page);
await page.waitForTimeout(4000);
let ask = page.locator(`#approval-${IDS.successor}`);
await ask.scrollIntoViewIfNeeded();
let sn = ask.locator('[data-testid="approval-snooze"]');
console.log('===== cold load, with kind=never / snoozed_until=infinity standing in decision_snoozes');
console.log('  block:', t(await sn.innerText()));
console.log('  said count:', await ask.locator('[data-testid="approval-snooze-said"]').count());
const said0 = ask.locator('[data-testid="approval-snooze-said"]');
if (await said0.count()) console.log('  said:', t(await said0.first().innerText()));
await shot(page, '19-snooze-reentry-never', false);

// ── 2 · the details sheet
await page.locator('[data-testid="mat-details"]').getByText(/YOUR DETAILS/i).first().click();
await page.waitForTimeout(4000);
const sheet = await page.evaluate(() => {
  const radio = document.querySelector('input[value="weekly_sunday"]');
  const dlg = radio ? radio.closest('[role="dialog"]') : document.querySelector('[role="dialog"]');
  const cadence = [...document.querySelectorAll('input[name]')]
    .filter((r) => ['right_away', 'daily', 'weekly_sunday'].includes(r.value))
    .map((r) => ({ value: r.value, name: r.name, checked: r.checked, label: (r.closest('label')?.innerText || '').replace(/\s+/g, ' ').trim() }));
  const digest = [...document.querySelectorAll('input')]
    .filter((r) => /never|daily|weekly|biweekly|monthly/.test(r.value) && !['daily', 'weekly_sunday', 'right_away'].includes(r.value))
    .map((r) => ({ value: r.value, name: r.name, checked: r.checked }));
  return {
    dialogText: (dlg ? dlg.innerText : document.body.innerText).replace(/\s+/g, ' ').trim(),
    cadence, digest,
  };
});
console.log('\n===== DETAILS SHEET');
console.log('cadence radios:', JSON.stringify(sheet.cadence, null, 1));
console.log('other frequency radios:', JSON.stringify(sheet.digest));
console.log('\n--- dialog text ---\n' + sheet.dialogText.slice(0, 4200));
await shot(page, '08-details-sheet-cadence', false);

// ── 3 · change the cadence
const weekly = page.locator('input[value="weekly_sunday"]').first();
await weekly.scrollIntoViewIfNeeded();
await weekly.click();
await page.waitForTimeout(4000);
console.log('\nweekly_sunday checked:', await weekly.isChecked());
await shot(page, '09-cadence-weekly-chosen', false);

await page.getByRole('button', { name: /shut/i }).first().click().catch(() => {});
await page.waitForTimeout(1500);

// ── 4 · snooze on the open approval
await openHouse(page);
await page.waitForTimeout(3500);
ask = page.locator(`#approval-${IDS.successor}`);
await ask.scrollIntoViewIfNeeded();
sn = ask.locator('[data-testid="approval-snooze"]');
await shot(page, '10-snooze-acts', false);
await sn.getByRole('button', { name: /^sunday$/i }).first().click();
await page.waitForTimeout(4000);
console.log('\n===== after pressing SUNDAY');
console.log('  block:', t(await sn.innerText()));
const said = ask.locator('[data-testid="approval-snooze-said"]');
console.log('  said:', (await said.count()) ? t(await said.first().innerText()) : '(none)');
await shot(page, '11-snooze-said', false);

await browser.close();
