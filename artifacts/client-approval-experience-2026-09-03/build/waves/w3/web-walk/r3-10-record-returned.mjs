import { open, signIn, shot, t, BASE, IDS, axe } from './lib-r3.mjs';

/* The two records the browser's own answers just minted. */

const { browser, page } = await open();
await signIn(page);

for (const [id, label] of [
  [IDS.g2pending, 'B · RETURNED, click_through (this walk pressed Return)'],
  [IDS.fifth, 'A2 · APPROVED, electronic_signature + typed name (this walk pressed Approve)'],
]) {
  await page.goto(`${BASE}/decisions/${id}/record`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('record-signature').waitFor({ state: 'visible', timeout: 60000 });
  const lines = await page
    .getByTestId('record-signature')
    .evaluate((el) => Array.from(el.querySelectorAll('p')).map((p) => p.textContent.replace(/\s+/g, ' ').trim()));
  console.log(`\n== ${label} ==`);
  console.log('  signature block lines:', JSON.stringify(lines));
  console.log('  record-signed-name nodes:', await page.getByTestId('record-signed-name').count());
  console.log('  stamp:', t(await page.getByTestId('record-stamp').first().innerText()).replace(/\n/g, ' | '));
  console.log('  mark:', t(await page.getByTestId('record-checksum').innerText().catch(() => '(none)')));
  console.log(
    '  landmarks:',
    JSON.stringify({
      main: await page.locator('main').count(),
      banner: await page.getByRole('banner').count(),
      contentinfo: await page.getByRole('contentinfo').count(),
    }),
  );
  const a = await axe(page);
  console.log('  axe violation types:', a.violations.length, a.violations.map((v) => `${v.impact}:${v.id}`).join(', '));
  await shot(page, `24-record-${id.slice(0, 8)}`);
}

await browser.close();
