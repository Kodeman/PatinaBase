const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + OUT + '/_rv4wrapped.html';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForTimeout(500);
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  const snap = () => page.evaluate(() => ({
    bodyLeft: document.body.scrollLeft, htmlLeft: document.documentElement.scrollLeft,
    scrollingLeft: document.scrollingElement.scrollLeft, winX: window.scrollX,
    coverLeft: Math.round(document.getElementById('h2').getBoundingClientRect().left),
  }));
  await page.evaluate(() => { document.getElementById('sheet-2').scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(200);
  const before = await snap();
  await page.screenshot({ path: OUT + '/rv4-390-before-shift.png' });
  await page.evaluate(() => { document.querySelector('.mq').scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(300);
  const after = await snap();
  await page.screenshot({ path: OUT + '/rv4-390-after-shift.png' });
  // can the user undo it? simulate a plain vertical scroll and a click
  await page.mouse.wheel(0, 200); await page.waitForTimeout(300);
  const afterWheel = await snap();
  console.log(JSON.stringify({ before, after, afterWheel }, null, 1));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
