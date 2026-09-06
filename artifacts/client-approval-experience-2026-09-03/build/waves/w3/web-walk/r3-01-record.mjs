import { open, signIn, shot, t, BASE, IDS, axe } from './lib-r3.mjs';

const { browser, page } = await open();
await signIn(page);

async function readSheet(url, label) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('record-signature').waitFor({ state: 'visible', timeout: 60000 });
  const sig = page.getByTestId('record-signature');
  const lines = await sig.evaluate((el) =>
    Array.from(el.querySelectorAll('p')).map((p) => p.textContent.replace(/\s+/g, ' ').trim()),
  );
  const name = await page.getByTestId('record-signed-name').count();
  const stamp = t(await page.getByTestId('record-stamp').first().innerText().catch(() => ''));
  const mark = t(await page.getByTestId('record-checksum').innerText().catch(() => ''));
  const marks = {
    main: await page.locator('main').count(),
    header: await page.locator('header').count(),
    footer: await page.locator('footer').count(),
    banner: await page.getByRole('banner').count(),
    contentinfo: await page.getByRole('contentinfo').count(),
  };
  const html = await page.content();
  console.log(`\n== ${label} ==`);
  console.log('  signature block lines:', JSON.stringify(lines));
  console.log('  record-signed-name nodes:', name);
  console.log('  stamp:', stamp.replace(/\n/g, ' | '));
  console.log('  mark:', mark, '(len', mark.replace(/^Mark /, '').replace(/ ·.*/, '').length, ')');
  console.log('  landmarks:', JSON.stringify(marks));
  console.log('  has 203.0.113.44:', html.includes('203.0.113.44'), '· /IP address/i:', /IP address/i.test(html));
  return { lines, marks };
}

await readSheet(`${BASE}/decisions/${IDS.predecessor}/record`, 'A · approved WITH typed name (e-sig)');
await shot(page, '01-record-approved-signed');

await readSheet(`${BASE}/decisions/${IDS.g3approved}/record`, 'C · approved, NULL method + NULL name (pre-00569 shape)');
await shot(page, '03-record-recorded-nullmethod');

await readSheet(`${BASE}/decisions/${IDS.g8returned}/record`, 'C2 · changes_requested, NULL method');
await shot(page, '03b-record-returned-nullmethod');

await readSheet(`${BASE}/proposals/${IDS.signedProposal}/record`, 'D · the signed proposal');
await shot(page, '04-record-proposal-signed');

/* axe on the decision record — `W3W-R1-08` asked for landmarks. */
await page.goto(`${BASE}/decisions/${IDS.predecessor}/record`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('record-signature').waitFor({ state: 'visible', timeout: 60000 });
const a = await axe(page);
console.log('\n== axe · /decisions/<id>/record ==');
for (const v of a.violations) console.log(`  [${v.impact}] ${v.id} ${v.nodes.length} nodes — ${v.help}`);
console.log('  violation types:', a.violations.length);
await shot(page, '05-axe-record');

/* Print emulation: the paper is white to its own edges. */
await page.emulateMedia({ media: 'print' });
const print = await page.evaluate(() => {
  const root = document.getElementById('record-print-root');
  const stamp = document.querySelector('[data-testid="record-stamp"]');
  const shadowed = Array.from(document.querySelectorAll('*')).filter((el) => {
    const s = getComputedStyle(el).boxShadow;
    return s && s !== 'none';
  }).length;
  return {
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    sheetBg: root ? getComputedStyle(root).backgroundColor : null,
    stampTransform: stamp ? getComputedStyle(stamp).transform : null,
    stampBg: stamp ? getComputedStyle(stamp).backgroundColor : null,
    shadowElements: shadowed,
  };
});
console.log('\n== print emulation · decision record ==');
console.log(' ', JSON.stringify(print, null, 2));
await shot(page, '06-print-decision');

await page.goto(`${BASE}/proposals/${IDS.signedProposal}/record`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('record-signature').waitFor({ state: 'visible', timeout: 60000 });
await page.emulateMedia({ media: 'print' });
const print2 = await page.evaluate(() => ({
  htmlBg: getComputedStyle(document.documentElement).backgroundColor,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  sheetBg: getComputedStyle(document.getElementById('record-print-root')).backgroundColor,
}));
console.log('== print emulation · proposal record ==\n ', JSON.stringify(print2));
await shot(page, '06b-print-proposal');

await browser.close();
