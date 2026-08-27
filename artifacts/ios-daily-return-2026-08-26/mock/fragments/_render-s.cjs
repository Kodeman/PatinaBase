const { chromium } = require('/Users/kody/Code/patina-merged/apps/designer-portal/node_modules/@playwright/test');
const path = require('path');
const DIR = __dirname;
const URL = 'file://' + path.join(DIR, '_preview-s.html');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1480, height: 1200 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errs.push('reqfail: ' + r.url() + ' — ' + ((r.failure()||{}).errorText)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(DIR, '_preview-s.png'), fullPage: true });
  // per-frame crops for close inspection
  const cells = await page.$$('.cell');
  for (let i = 0; i < cells.length; i++) {
    await cells[i].screenshot({ path: path.join(DIR, `_shot-${i + 1}.png`) });
  }
  // overflow probe: any element wider than its frame screen
  const probe = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.frame__screen').forEach((s, i) => {
      const sr = s.getBoundingClientRect();
      s.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.right > sr.right + 0.5 || r.left < sr.left - 0.5 || r.bottom > sr.bottom + 0.5) {
          out.push(`frame ${i + 1}: ${el.className || el.tagName} ` +
            `L${(r.left - sr.left).toFixed(0)} R${(r.right - sr.left).toFixed(0)} B${(r.bottom - sr.top).toFixed(0)}`);
        }
      });
      const sb = s.querySelector('.screen-body--scroll');
      if (sb && sb.scrollHeight > sb.clientHeight + 1) out.push(`frame ${i + 1}: scroll body content ${sb.scrollHeight} > ${sb.clientHeight}`);
    });
    return out;
  });
  console.log('ERRORS:', errs.length ? errs.join('\n  ') : 'none');
  console.log('OVERFLOW:\n  ' + (probe.length ? probe.join('\n  ') : 'none'));
  await browser.close();
})();
