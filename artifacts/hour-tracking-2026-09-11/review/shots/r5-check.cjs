const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + OUT + '/_r5wrapped.html';

(async () => {
  const browser = await chromium.launch();
  const out = { assertions: [] };

  // ---------- 390 x 844 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(600);
    try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
    await page.waitForTimeout(300);

    const a1 = await page.evaluate(() => ({
      docSW: document.documentElement.scrollWidth, iw: window.innerWidth
    }));
    out.assertions.push({
      id: 'A1', viewport: '390x844',
      expr: 'document.documentElement.scrollWidth <= window.innerWidth',
      scrollWidth: a1.docSW, innerWidth: a1.iw, pass: a1.docSW <= a1.iw
    });

    await page.evaluate(() => document.getElementById('sheet-2').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '/r5-390-sheet02.png' });

    const a2 = await page.evaluate(() => {
      const el = document.querySelector('#sheet-2 .mq');
      const r = el.getBoundingClientRect();
      return {
        text: el.textContent.trim(),
        left: r.left, right: r.right, iw: window.innerWidth,
        clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
        clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
        scrollX: window.scrollX
      };
    });
    out.assertions.push({
      id: 'A2', viewport: '390x844',
      expr: "sheet 02 .mq fully within the viewport (0 <= left, right <= innerWidth, scrollWidth <= clientWidth, scrollHeight <= clientHeight)",
      ...a2,
      pass: a2.left >= 0 && a2.right <= a2.iw && a2.scrollWidth <= a2.clientWidth && a2.scrollHeight <= a2.clientHeight
    });

    // belt: the displacement path T4-4 named
    await page.evaluate(() => document.querySelector('#sheet-2 .mq').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    const disp = await page.evaluate(() => ({ scrollX: window.scrollX, docSW: document.documentElement.scrollWidth }));
    out.displacement_after_scrollIntoView_on_mq = disp;
    await ctx.close();
  }

  // ---------- 1440 x 900 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(600);
    try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('sheet-2').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '/r5-1440-sheet02.png' });

    const a3 = await page.evaluate(() => [...document.querySelectorAll('#sheet-2 .scroller')].map((e, i) => ({
      i, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, delta: e.scrollWidth - e.clientWidth
    })));
    out.assertions.push({
      id: 'A3', viewport: '1440x900',
      expr: "every #sheet-2 .scroller: scrollWidth <= clientWidth + 3",
      scrollers: a3, count: a3.length,
      pass: a3.length > 0 && a3.every(s => s.scrollWidth <= s.clientWidth + 3)
    });

    out.all_scrollers_1440 = await page.evaluate(() =>
      [...document.querySelectorAll('.scroller')].map(e => e.scrollWidth - e.clientWidth).filter(x => x > 0));
    out.docSW_1440 = await page.evaluate(() => ({ docSW: document.documentElement.scrollWidth, iw: window.innerWidth }));

    // T4-3: gutter must not be sticky at <=1000 — check at 1440 it still is
    out.gutter_position_1440 = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#sheet-2 .gutter')).position);
    await ctx.close();
  }

  // ---------- T4-3 spot check at 900 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(500);
    out.gutter_position_900 = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#sheet-2 .gutter')).position);
    await page.evaluate(() => document.getElementById('sheet-14').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + '/r5-900-gutter.png' });
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
