import { open, signIn, shot, t, BASE, IDS } from './lib-r2.mjs';

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
console.log('signed in, url:', page.url());

for (const [label, url, n] of [
  ['decision', `${BASE}/decisions/${IDS.predecessor}/record`, '01'],
  ['proposal', `${BASE}/proposals/${IDS.signedProposal}/record`, '02'],
]) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const body = await page.evaluate(() => document.body.innerText);
  console.log(`\n===== ${label} :: ${url}`);
  console.log('--- innerText ---');
  console.log(t(body).slice(0, 2400));
  const html = await page.content();
  const ipv4 = html.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  console.log('--- ipv4 in DOM:', ipv4 ? JSON.stringify([...new Set(ipv4)]) : 'none');
  console.log('--- "IP address" string:', /IP address/i.test(html));
  console.log('--- 203.0.113.44 present:', html.includes('203.0.113.44'));
  const mark = t(body).match(/MARK ([A-Z0-9]+)/);
  console.log('--- checksum:', mark ? `${mark[1]} (len ${mark[1].length})` : 'none');
  const stamps = await page.locator('[data-stamp-state]').all();
  for (const s of stamps) {
    const st = await s.getAttribute('data-stamp-state');
    const style = await s.evaluate((el) => {
      const c = getComputedStyle(el);
      return { transform: c.transform, color: c.color, bg: c.backgroundColor, shadow: c.boxShadow };
    });
    console.log('--- stamp', st, JSON.stringify(style), '| text:', t(await s.innerText()).slice(0, 60));
  }
  // landmarks / region (W3W-R1-08)
  const lm = await page.evaluate(() => ({
    main: document.querySelectorAll('main').length,
    nav: document.querySelectorAll('nav').length,
    header: document.querySelectorAll('header').length,
    roles: [...document.querySelectorAll('[role]')].map((e) => e.getAttribute('role')).slice(0, 12),
  }));
  console.log('--- landmarks:', JSON.stringify(lm));
  // "Keep a copy" / toolbar acts
  const acts = await page.evaluate(() =>
    [...document.querySelectorAll('a,button')].map((e) => ({
      tag: e.tagName,
      text: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 44),
      testid: e.getAttribute('data-testid'),
      href: e.getAttribute('href'),
    })).filter((a) => a.text)
  );
  console.log('--- acts:', JSON.stringify(acts));
  await shot(page, `${n}-record-${label}-1280`, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  await shot(page, `${n}b-record-${label}-390`, true);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.waitForTimeout(500);

  // print emulation
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(900);
  const pr = await page.evaluate(() => {
    const stamp = document.querySelector('[data-stamp-state]');
    const sheet = document.querySelector('#record-print-root') || document.querySelector('article') || document.body.firstElementChild;
    const shadows = [...document.querySelectorAll('*')].filter((e) => {
      const s = getComputedStyle(e).boxShadow;
      return s && s !== 'none';
    }).map((e) => e.tagName + '.' + (e.className || '').toString().slice(0, 40));
    return {
      stampTransform: stamp ? getComputedStyle(stamp).transform : null,
      stampBg: stamp ? getComputedStyle(stamp).backgroundColor : null,
      stampShadow: stamp ? getComputedStyle(stamp).boxShadow : null,
      sheetBg: sheet ? getComputedStyle(sheet).backgroundColor : null,
      sheetId: sheet ? (sheet.id || sheet.tagName) : null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      shadowElements: shadows.slice(0, 6),
    };
  });
  console.log('--- PRINT:', JSON.stringify(pr, null, 1));
  await shot(page, `04-print-${label}`, true);
  await page.emulateMedia({ media: 'screen' });
  await page.waitForTimeout(400);
}

// the returned / held record — W3W-R1-05 (hard-coded "Signed")
for (const [label, id] of [
  ['returned G8', IDS.g8returned],
  ['approved G3', IDS.g3approved],
]) {
  await page.goto(`${BASE}/decisions/${id}/record`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const txt = t(await page.evaluate(() => document.body.innerText));
  console.log(`\n===== record ${label}\n${txt.slice(0, 1400)}`);
  await shot(page, `18-record-${label.replace(/\s+/g, '-')}`, true);
}

await browser.close();
