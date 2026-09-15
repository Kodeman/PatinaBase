const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const url = 'file:///Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots/_wrapped.html';

(async () => {
  const browser = await chromium.launch();

  // A · where do the .widest tables stop clipping?
  for (const w of [1440, 1512, 1600, 1280, 1180, 1024, 900, 861, 860, 768]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage(); await page.goto(url); await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const s = [...document.querySelectorAll('.scroller')].map((el, i) => ({ i, c: el.clientWidth, s: el.scrollWidth }));
      const clipped = s.filter(x => x.s > x.c + 1);
      const t3 = document.querySelector('#sheet-3 table');
      return { clipped, mainW: Math.round(document.querySelector('#sheet-3 .main').getBoundingClientRect().width),
               tableDisplay: getComputedStyle(t3).display, headVisible: getComputedStyle(document.querySelector('#sheet-3 thead')).position };
    });
    console.log(`w=${String(w).padEnd(5)} main=${r.mainW} tableDisplay=${r.tableDisplay} thead=${r.headVisible} clipped=${JSON.stringify(r.clipped)}`);
    await ctx.close();
  }

  // B · index readout truth table at 1440
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); await page.goto(url); await page.waitForTimeout(400);
    console.log('\n-- index readout vs actual sheet (ArrowDown x6, then ArrowUp x3) --');
    const read = () => page.evaluate(() => {
      const y = window.scrollY + window.innerHeight / 2;
      let actual = 1;
      document.querySelectorAll('.slide').forEach((s, i) => { if (s.offsetTop <= y) actual = i + 1; });
      return { y: Math.round(window.scrollY), shown: document.getElementById('idxn').textContent, actual };
    });
    console.log('start  ', JSON.stringify(await read()));
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(1100); console.log('down'+(i+1)+' ', JSON.stringify(await read())); }
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(1100); console.log('up'+(i+1)+'   ', JSON.stringify(await read())); }

    // C · can a keyboard user reach the clipped 48px of the widest tables?
    const res = await page.evaluate(async () => {
      const sc = document.querySelectorAll('#sheet-3 .scroller')[0];
      sc.focus({ preventScroll: true });
      return { focused: document.activeElement === sc, tabIndexAttr: sc.getAttribute('tabindex'), before: sc.scrollLeft, max: sc.scrollWidth - sc.clientWidth };
    });
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
    const after = await page.evaluate(() => document.querySelectorAll('#sheet-3 .scroller')[0].scrollLeft);
    console.log('\n-- scroller keyboard reachability --');
    console.log(JSON.stringify({ ...res, scrollLeftAfterArrowRight: after }));

    // D · fonts actually applied?
    const fonts = await page.evaluate(() => ({
      loaded: [...document.fonts].map(f => f.family + ' ' + f.status).slice(0, 8),
      h1: getComputedStyle(document.querySelector('#h1')).fontFamily,
      ready: document.fonts.status,
    }));
    console.log('\n-- fonts --'); console.log(JSON.stringify(fonts));

    // E · heading/aria structure
    const a11y = await page.evaluate(() => ({
      headings: [...document.querySelectorAll('h1,h2,h3')].map(h => h.tagName + ' ' + h.textContent.trim().slice(0, 40)),
      landmarks: [...document.querySelectorAll('main,nav,header,footer,[role]')].map(e => e.tagName + '[' + (e.getAttribute('role')||'') + ']').slice(0,6),
      tablesWithCaption: document.querySelectorAll('table caption').length,
      tables: document.querySelectorAll('table').length,
      ariaHiddenIdx: document.getElementById('idx').getAttribute('aria-hidden'),
      lang: document.documentElement.getAttribute('lang'),
    }));
    console.log('\n-- structure --'); console.log(JSON.stringify(a11y, null, 1));
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
