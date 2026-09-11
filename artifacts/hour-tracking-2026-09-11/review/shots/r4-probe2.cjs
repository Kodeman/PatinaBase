const { createRequire } = require('module');
const req = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = req('@playwright/test');
const fs = require('fs'); const path = require('path');
const DIR = __dirname; const URL = 'file://' + path.join(DIR, '_r3wrapped.html');

(async () => {
  const out = {};
  const browser = await chromium.launch();

  // 1. honest painted-overflow probe at 390/430 (ancestor walk STOPS at body,
  //    so body{overflow-x:hidden} can no longer mask a real overflow)
  for (const w of [390, 430, 768]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    out['honest@' + w] = await page.evaluate(() => {
      const iw = window.innerWidth;
      const bad = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= iw + 0.5 && r.left >= -0.5) continue;
        let p = el.parentElement, clipped = false;
        while (p && p !== document.body) {                 // stop at body
          const cs = getComputedStyle(p);
          if (cs.overflowX !== 'visible' || cs.clipPath !== 'none') { clipped = true; break; }
          p = p.parentElement;
        }
        if (clipped) continue;
        bad.push({ tag: el.tagName, cls: String(el.className).slice(0,44), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent||'').trim().slice(0,60) });
      }
      // also: cells whose own content is wider than the cell (intrinsic overflow)
      const tight = [];
      for (const td of document.querySelectorAll('td')) {
        if (td.scrollWidth > td.clientWidth + 1) tight.push({ sheet: td.closest('section').id, cls: td.className, over: td.scrollWidth - td.clientWidth, ws: getComputedStyle(td).whiteSpace, text: (td.textContent||'').trim().slice(0,60) });
      }
      return { innerWidth: iw, docScrollWidth: document.documentElement.scrollWidth, painted: bad.slice(0,25), paintedCount: bad.length, tightCells: tight.slice(0,25), tightCount: tight.length };
    });
    await ctx.close();
  }

  // 2. exact upper edge of the 901+ clipping band
  {
    const ctx = await browser.newContext({ viewport: { width: 901, height: 900 }, colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const band = [];
    for (let w = 895; w <= 1060; w += 5) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(60);
      const d = await page.evaluate(() => {
        const s = Array.from(document.querySelectorAll('.scroller')).map(e => e.scrollWidth - e.clientWidth).filter(v => v > 1);
        const m = document.querySelector('#sheet-3 .main');
        return { n: s.length, max: s.length ? Math.max.apply(null, s) : 0, mainW: Math.round(m.getBoundingClientRect().width) };
      });
      band.push({ w, ...d });
    }
    out.band = band;
    await ctx.close();
  }

  // 3. tab order from a fresh load at 901 (where 4 scrollers are focusable) and at 1440
  for (const w of [1440, 901]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const seq = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      seq.push(await page.evaluate(() => {
        const a = document.activeElement;
        if (!a) return 'none';
        return a.tagName + '.' + String(a.className).slice(0,24) + (a.closest && a.closest('section') ? ' @' + a.closest('section').id : '') + ' | outline=' + getComputedStyle(a).outlineWidth;
      }));
    }
    out['tab@' + w] = seq;
    await ctx.close();
  }

  // 4. print media in a dark-OS context WITHOUT forcing colorScheme on emulateMedia
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(200);
    out.printDarkNatural = await page.evaluate(() => ({
      paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
      bodyColor: getComputedStyle(document.body).color,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      printColorAdjust: getComputedStyle(document.body).printColorAdjust || getComputedStyle(document.body).webkitPrintColorAdjust
    }));
    const pdf = await page.pdf({ path: path.join(DIR, 'r4-print-dark.pdf'), printBackground: false });
    out.pdfBytes = pdf.length;
    await ctx.close();
  }

  // 5. font-load timing: does a scroller that becomes overflowing after webfont
  //    swap get its tabindex? (no resize event fires on font load)
  {
    const ctx = await browser.newContext({ viewport: { width: 940, height: 900 }, colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.route('https://fonts.gstatic.com/**', r => setTimeout(() => r.continue(), 1500));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => Array.from(document.querySelectorAll('.scroller')).map(e => ({ over: e.scrollWidth - e.clientWidth, tab: e.getAttribute('tabindex') })));
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => Array.from(document.querySelectorAll('.scroller')).map(e => ({ over: e.scrollWidth - e.clientWidth, tab: e.getAttribute('tabindex') })));
    out.fontSwap = { before: before.filter(x => x.over > 1 || x.tab), after: after.filter(x => x.over > 1 || x.tab),
      mismatch: after.filter(x => x.over > 1 && !x.tab).length };
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(DIR, 'r4-report2.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ honest390: out['honest@390'].paintedCount, tight390: out['honest@390'].tightCount,
    honest430: out['honest@430'].paintedCount, tight430: out['honest@430'].tightCount,
    honest768: out['honest@768'].paintedCount, tight768: out['honest@768'].tightCount,
    printDarkNatural: out.printDarkNatural, fontSwap: out.fontSwap }, null, 1));
})().catch(e => { console.error('FAIL', e); process.exit(1); });
