// Round-5 diagnostic: identify the 1024 scroller overflow, the in-scroller
// offenders at 390, and measure keyboard paging deterministically (reduced
// motion => instant scroll, so landings are final, not mid-animation).
const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + OUT + '/_r5bwrapped.html';

async function settle(page) {
  await page.waitForTimeout(500);
  try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const out = {};

  // 1) width sweep for scroller overflow
  {
    const widths = [861, 900, 960, 1000, 1001, 1024, 1100, 1200, 1280, 1366, 1440];
    out.sweep = {};
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(URL); await settle(page);
      out.sweep[w] = await page.evaluate(() => ({
        docSW: document.documentElement.scrollWidth,
        over: [...document.querySelectorAll('.scroller')].map(e => ({
          sheet: e.closest('section') ? e.closest('section').id : null,
          d: e.scrollWidth - e.clientWidth, cw: e.clientWidth, sw: e.scrollWidth
        })).filter(x => x.d > 3)
      }));
      await ctx.close();
    }
  }

  // 2) what drives sheet-14 at 1024 + screenshot
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.goto(URL); await settle(page);
    out.sheet14_1024 = await page.evaluate(() => {
      const sc = document.querySelector('#sheet-14 .scroller');
      const t = sc.querySelector('table');
      const heads = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
      const widths = [...t.querySelectorAll('thead th')].map(th => Math.round(th.getBoundingClientRect().width));
      // per-column min-content estimate: widest single unbreakable token per column
      const rows = [...t.querySelectorAll('tbody tr')];
      const clipped = [];
      const scRect = sc.getBoundingClientRect();
      t.querySelectorAll('td,th').forEach(c => {
        const r = c.getBoundingClientRect();
        if (r.right > scRect.right + 0.5) clipped.push({ txt: c.textContent.trim().slice(0, 50), over: +(r.right - scRect.right).toFixed(1) });
      });
      return { tableSW: t.scrollWidth, scrollerCW: sc.clientWidth, heads, widths,
               rowCount: rows.length, clippedCount: clipped.length, clippedSample: clipped.slice(0, 6),
               tabindex: sc.getAttribute('tabindex'), ariaLabel: sc.getAttribute('aria-label') };
    });
    await page.evaluate(() => document.getElementById('sheet-14').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + '/r5b-1024-sheet14.png' });
    await ctx.close();
  }

  // 3) the 8 in-scroller offenders at 390
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL); await settle(page);
    out.offenders390 = await page.evaluate(() => {
      const iw = window.innerWidth, res = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.width <= 1.5 && r.height <= 1.5) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        if (r.right > iw + 0.5 || r.left < -0.5) {
          // is it inside a clipped (visually hidden) ancestor?
          let a = el, clippedAncestor = null;
          while (a && a !== document.body) {
            const acs = getComputedStyle(a);
            if (acs.clipPath && acs.clipPath !== 'none') { clippedAncestor = a.tagName + '.' + (a.className || ''); break; }
            a = a.parentElement;
          }
          res.push({ tag: el.tagName, cls: String(el.className || ''), left: +r.left.toFixed(1), right: +r.right.toFixed(1),
                     clippedAncestor, scrollerOverflowX: (() => { const s = el.closest('.scroller'); return s ? getComputedStyle(s).overflowX : null; })(),
                     text: (el.textContent || '').trim().slice(0, 50) });
        }
      });
      return res;
    });
    await ctx.close();
  }

  // 4) keyboard, deterministic (reduced motion => instant)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(URL); await settle(page);
    const tops = await page.evaluate(() => [...document.querySelectorAll('.slide')].map(s => Math.round(s.getBoundingClientRect().top + window.scrollY)));
    const seq = [];
    const press = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(160); seq.push([k, await page.evaluate(() => Math.round(window.scrollY))]); };
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'j', 'ArrowLeft', 'k', 'End', 'Home']) await press(k);
    // fast repeat: 6 presses at 40ms
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(40); }
    await page.waitForTimeout(600);
    const afterRepeat = await page.evaluate(() => Math.round(window.scrollY));
    // Home/End then immediate arrow (T4-9)
    await page.keyboard.press('End'); await page.waitForTimeout(60);
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(400);
    const endThenLeft = await page.evaluate(() => Math.round(window.scrollY));
    // modifier + form-field guards
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);
    await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(300);
    const shift = await page.evaluate(() => Math.round(window.scrollY));
    await page.keyboard.press('Control+ArrowRight'); await page.waitForTimeout(300);
    const ctrl = await page.evaluate(() => Math.round(window.scrollY));
    out.keyboard = { tops, seq, afterRepeat, repeatTargetIdx: tops.indexOf(afterRepeat), endThenLeft,
                     lastTop: tops[tops.length - 1], secondLastTop: tops[tops.length - 2],
                     afterShift: shift, afterCtrl: ctrl };
    // tab order
    out.tabOrder = await page.evaluate(() => {
      const r = [];
      document.querySelectorAll('[tabindex]').forEach(e => r.push(e.tagName + '.' + (e.className || '') + ' tabindex=' + e.getAttribute('tabindex') + ' label=' + (e.getAttribute('aria-label') || '')));
      return r;
    });
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
