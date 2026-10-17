// usage: node explore.js <portal> <path> [size] [shotName] [email]
const { open, shot, PORTALS } = require('./lib.cjs');
(async () => {
  const [portal, p, size = 'wide', name, email] = process.argv.slice(2);
  const { browser, page } = await open(portal, size, { email });
  await page.goto(PORTALS[portal].base + p, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForTimeout(Number(process.env.WAIT || 6000));
  console.log('url', page.url());
  if (name) await shot(page, name);
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text.slice(0, Number(process.env.CHARS || 3000)));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
