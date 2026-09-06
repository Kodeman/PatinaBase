import { open, signIn, openHouse, shot, t, IDS } from './lib-r3.mjs';

const { browser, page } = await open({ height: 1400 });
await signIn(page);
await openHouse(page, '');
await page.waitForTimeout(800);

/* ── the details sheet ────────────────────────────────────────────────────── */
await page.locator('[data-testid="mat-details"]').getByText(/YOUR DETAILS/i).first().click();
await page.waitForTimeout(4000);

const sheet = page
  .locator('[role="dialog"]')
  .filter({ has: page.locator('input[name="details-reminder-cadence"]') })
  .first();
await sheet.waitFor({ state: 'visible', timeout: 30000 });

const radios = await sheet.evaluate((el) =>
  Array.from(el.querySelectorAll('input[type="radio"]')).map((r) => ({
    name: r.name,
    value: r.value,
    checked: r.checked,
    label: r.closest('label')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
  })),
);
const groups = [...new Set(radios.map((r) => r.name))];
console.log('\n== radio groups in the sheet ==');
console.log('  groups:', JSON.stringify(groups));
for (const r of radios) console.log(`   ${r.name} = ${r.value}${r.checked ? ' ✓' : ''}  "${r.label}"`);

const sheetText = t(await sheet.evaluate((el) => el.innerText));
for (const phrase of [
  'Digest frequency',
  'Re-engagement',
  'Occasional notes from your studio',
  'Reminder cadence',
  'right_away',
  'weekly_sunday',
  'daily_digest',
]) {
  const n = (sheetText.match(new RegExp(phrase, 'g')) || []).length;
  console.log(`  "${phrase}" ×${n}`);
}
const quiet = sheetText.match(/Approval mail waits[^]*?never waits\./)?.[0];
console.log('\n  quiet-hours sentence:', quiet ?? '(not found)');
await shot(page, '16-details-sheet');

/* the cadence write — the regression leg */
const weekly = sheet.locator('input[name="details-reminder-cadence"][value="weekly_sunday"]');
await weekly.click();
await page.waitForTimeout(4000);
console.log('  chose "Once a week, on Sunday"; checked now:', await weekly.isChecked());
console.log('  every cadence radio after the click:', JSON.stringify(
  await sheet.evaluate((el) => Array.from(el.querySelectorAll('input[name=\"details-reminder-cadence\"]')).map((r) => `${r.value}${r.checked ? ' ✓' : ''}`))));
await shot(page, '17-cadence-weekly-chosen');

await page.keyboard.press('Escape');
await page.waitForTimeout(600);

/* ── the snooze acts on a live ask ────────────────────────────────────────── */
const card = page.locator(`#approval-${IDS.successor}`);
await card.scrollIntoViewIfNeeded();
const snooze = card.getByTestId('approval-snooze');
const acts = await snooze.evaluate((el) =>
  Array.from(el.querySelectorAll('button')).map((b) => ({
    text: b.textContent.replace(/\s+/g, ' ').trim(),
    pressed: b.getAttribute('aria-pressed'),
  })),
);
console.log('\n== Remind me, on a DATED approval ==');
console.log('  acts:', JSON.stringify(acts));
console.log('  beneath:', t(await snooze.innerText()).replace(/\n/g, ' | '));
await shot(page, '18-snooze-acts');

/* Don't remind me — the sentence, and the row it writes */
const never = snooze.getByRole('button', { name: /don't remind me/i });
await never.click();
await page.waitForTimeout(2500);
console.log('  said after DON\'T REMIND ME:', t(await snooze.innerText()).replace(/\n/g, ' | '));
await shot(page, '19-snooze-never-said');

await browser.close();
