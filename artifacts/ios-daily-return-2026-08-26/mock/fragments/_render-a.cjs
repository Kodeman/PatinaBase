// Renders _preview-a.html to _preview-a.png (2x) for the Direction A render check.
const { chromium } = require('/Users/kody/Code/patina-merged/apps/designer-portal/node_modules/@playwright/test');
const path = require('path');
const HERE = __dirname;
const URL = 'file://' + path.join(HERE, '_preview-a.html');
(async () => {
  const errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1100 } });
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errs.push('reqfail: ' + r.url() + ' — ' + ((r.failure()||{}).errorText)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(HERE, '_preview-a.png'), fullPage: true });
  const n = (await page.$$('figure')).length;
  console.log(JSON.stringify({ errors: errs, frames: n }, null, 2));
  await browser.close();
})();
