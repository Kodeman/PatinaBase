import { open, signIn, openHouse, shot, t, IDS, BASE } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(2500);

// find the element that contains the cadence radios and print its whole subtree
const info = await page.evaluate(() => {
  const radio = document.querySelector('input[value="weekly_sunday"]');
  if (!radio) return { found: false };
  let root = radio;
  for (let i = 0; i < 14 && root.parentElement; i++) root = root.parentElement;
  const dlg = radio.closest('[role="dialog"],dialog,[data-testid]');
  return {
    found: true,
    dialogTestid: dlg?.getAttribute?.('data-testid') ?? dlg?.tagName,
    visible: !!(radio.offsetParent || radio.getClientRects().length),
    subtree: (root.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 4000),
  };
});
console.log('cadence container:', info.dialogTestid, 'visible:', info.visible);
console.log('\n=== SUBTREE ===\n' + info.subtree);

// try to open the sheet for a screenshot
const acts = await page.locator('[data-testid="mat-details"] a, [data-testid="mat-details"] button').all();
console.log('\nmat-details acts:', acts.length);
for (const a of acts) console.log('  ', t(await a.innerText()), '| href', await a.getAttribute('href'));
await browser.close();
