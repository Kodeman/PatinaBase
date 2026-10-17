const { open, shot, PORTALS } = require('./lib.cjs');
(async () => {
  const portal = process.argv[2];
  const { browser, page } = await open(portal, 'wide', { email: 'x' });
  await page.goto(`${PORTALS[portal].base}/auth/signin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  const pw = page.getByText('Use a password instead');
  console.log('pw links', await pw.count());
  if (await pw.count()) await pw.first().click();
  await page.waitForTimeout(1500);
  const html = await page.evaluate(() => Array.from(document.querySelectorAll('input,button')).map((e) => `${e.tagName} type=${e.type} name=${e.name} txt=${(e.innerText || e.placeholder || '').slice(0, 30)}`).join('\n'));
  console.log(html);
  await shot(page, 'probe-signin-pw');
  await browser.close();
})();
