import { open, signIn, openHouse, shot, t, IDS, BASE } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(2500);

// ---- the details sheet (cadence)
const details = page.locator('[data-testid="mat-details"]');
console.log('mat-details count:', await details.count(), '::', t(await details.first().innerText()).slice(0, 120));
await details.first().locator('a,button').first().click().catch(async () => { await details.first().click(); });
await page.waitForTimeout(2500);
const sheetTxt = t(await page.evaluate(() => document.body.innerText));
const i = sheetTxt.toLowerCase().indexOf('remind');
console.log('\n=== DETAILS SHEET (around "remind") ===');
console.log(sheetTxt.slice(Math.max(0, i - 900), i + 1400));
await shot(page, '08-details-sheet-cadence', true);

// radio/option probing
const opts = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('input[type=radio],[role=radio],button').forEach((e) => {
    const label = (e.closest('label')?.innerText || e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g,' ').trim();
    if (/right away|once a day|once a week|sunday/i.test(label)) {
      out.push({ tag: e.tagName, value: e.value ?? null, checked: e.checked ?? null, label: label.slice(0, 90) });
    }
  });
  return out;
});
console.log('\ncadence controls:', JSON.stringify(opts, null, 1));
const html = await page.content();
for (const tok of ['right_away','daily','weekly_sunday','weekly_digest','daily_digest','immediate']) {
  const re = new RegExp(`\\b${tok}\\b`);
  console.log(`  token "${tok}" in DOM html:`, re.test(html));
}
await browser.close();
