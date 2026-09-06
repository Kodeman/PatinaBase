import { open, signIn, openHouse, shot, t, IDS } from './lib-r2.mjs';

const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);

// ── a DATED hold survives the reload
await openHouse(page);
await page.waitForTimeout(4000);
const ask = page.locator(`#approval-${IDS.successor}`);
await ask.scrollIntoViewIfNeeded();
const sn = ask.locator('[data-testid="approval-snooze"]');
const said = ask.locator('[data-testid="approval-snooze-said"]');
console.log('===== cold load with kind=sunday standing');
console.log('  said count:', await said.count());
if (await said.count()) console.log('  said:', t(await said.first().innerText()));
const marked = await sn.evaluate((el) =>
  [...el.querySelectorAll('button')].map((b) => ({
    text: b.innerText.replace(/\s+/g, ' ').trim(),
    pressed: b.getAttribute('aria-pressed'),
    current: b.getAttribute('aria-current'),
    disabled: b.disabled,
  }))
);
console.log('  acts:', JSON.stringify(marked));
await shot(page, '19b-snooze-reentry-sunday', false);

// ── "Don't remind me" — W3W-R1-09
await sn.getByRole('button', { name: /don.t remind me/i }).first().click();
await page.waitForTimeout(4000);
console.log("\n===== after DON'T REMIND ME");
console.log('  said:', (await said.count()) ? t(await said.first().innerText()) : '(none)');
await shot(page, '20-snooze-never', false);

// ── past-due approval — no snooze, and its date line
const pd = page.locator(`#approval-${IDS.g6overdue}`);
await pd.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
console.log('\n===== past-due approval (G6, due Aug 31)');
console.log('  snooze block count:', await pd.locator('[data-testid="approval-snooze"]').count());
const note = pd.locator('[data-testid="approval-snooze-past-due"]');
console.log('  past-due sentence:', (await note.count()) ? t(await note.first().innerText()) : '(none)');
const dateLine = await pd.evaluate((el) => {
  const n = [...el.querySelectorAll('*')].find((e) => e.children.length === 0 && /^Due\b|Past due/i.test((e.innerText || '').trim()));
  return n ? n.innerText.replace(/\s+/g, ' ').trim() : null;
});
console.log('  date line:', JSON.stringify(dateLine));
console.log('  "overdue" on the card:', /overdue/i.test(await pd.innerText()));
await shot(page, '12-past-due-no-snooze', false);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await pd.scrollIntoViewIfNeeded();
await shot(page, '23-past-due-390', false);
await page.setViewportSize({ width: 1280, height: 1400 });

await browser.close();
