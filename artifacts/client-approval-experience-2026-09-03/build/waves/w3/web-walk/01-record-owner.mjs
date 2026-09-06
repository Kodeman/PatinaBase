import { open, signIn, shot, t, BASE, IDS } from './lib.mjs';

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
console.log('signed in, url:', page.url());

for (const [label, url] of [
  ['decision', `${BASE}/decisions/${IDS.predecessor}/record`],
  ['proposal', `${BASE}/proposals/${IDS.signedProposal}/record`],
]) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const body = await page.evaluate(() => document.body.innerText);
  console.log(`\n===== ${label} :: ${url}`);
  console.log('status url:', page.url());
  console.log('--- innerText ---');
  console.log(t(body).slice(0, 2200));
  const html = await page.content();
  const ipv4 = html.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  console.log('--- ipv4 in DOM:', ipv4 ? JSON.stringify(ipv4) : 'none');
  console.log('--- "IP address" string:', /IP address/i.test(html));
  const stamps = await page.locator('[data-stamp-state]').all();
  for (const s of stamps) {
    const st = await s.getAttribute('data-stamp-state');
    const style = await s.evaluate((el) => {
      const c = getComputedStyle(el);
      return { transform: c.transform, color: c.color, bg: c.backgroundColor, shadow: c.boxShadow };
    });
    console.log('--- stamp', st, JSON.stringify(style), '| text:', t(await s.innerText()).slice(0, 60));
  }
  await shot(page, `${label === 'decision' ? '01' : '02'}-record-${label}-1280`, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await shot(page, `${label === 'decision' ? '01b' : '02b'}-record-${label}-390`, true);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.waitForTimeout(400);
}
await browser.close();
