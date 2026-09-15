const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + OUT + '/_rv4wrapped.html';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForTimeout(600);
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  const measures = await page.evaluate(() => {
    function chWidth(el) {
      const cs = getComputedStyle(el);
      const c = document.createElement('canvas').getContext('2d');
      c.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      return c.measureText('0').width;
    }
    const out = [];
    document.querySelectorAll('.verdicts .t-body, .measure, .ann p, table.sheet td:not(.src):not(.id):not(.num):not(.mark)').forEach((el, i) => {
      if (i > 400) return;
      const w = el.getBoundingClientRect().width;
      const ch = chWidth(el);
      out.push({ w: Math.round(w), ch: Math.round(w / ch), cls: String(el.className || el.tagName) });
    });
    const byCls = {};
    out.forEach(o => { byCls[o.cls] = byCls[o.cls] || []; byCls[o.cls].push(o.ch); });
    const summary = {};
    Object.entries(byCls).forEach(([k, v]) => summary[k] = { n: v.length, max: Math.max(...v), median: v.sort((a,b)=>a-b)[Math.floor(v.length/2)] });
    return summary;
  });
  console.log(JSON.stringify(measures, null, 1));
  await page.evaluate(() => { const e = document.getElementById('sheet-2'); window.scrollTo(0, e.offsetTop); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/rv4-1440-light-sheet-2.png' });
  await ctx.close(); await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
