/* Round-2 follow-up probes: instant-scroll position truth, clean tab order,
   skip-link focus. Run: cd apps/designer-portal && node <this file> */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');

const DIR = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + path.join(DIR, '_r2wrapped.html');
const out = {};

(async () => {
  const browser = await chromium.launch();

  // --- A. clean first-Tab order from a fresh load ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const seq = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(120);
      seq.push(await page.evaluate(() => {
        const a = document.activeElement;
        return {
          tag: a.tagName, cls: typeof a.className === 'string' ? a.className : '',
          name: a.getAttribute('aria-label') || (a.textContent || '').trim().slice(0, 30),
          scrollable: a.scrollWidth - a.clientWidth > 0,
          y: Math.round(window.scrollY),
        };
      }));
    }
    out.tabSequence = seq;
    await ctx.close();
  }

  // --- B. skip link: focus destination after activation, from a fresh load ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await page.keyboard.press('Tab');
    out.skip = { focusedBefore: await page.evaluate(() => document.activeElement.className) };
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    out.skip.after = await page.evaluate(() => ({
      activeId: document.activeElement.id, activeTag: document.activeElement.tagName,
      y: Math.round(window.scrollY), sheet2Top: Math.round(document.getElementById('sheet-2').getBoundingClientRect().top),
    }));
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    out.skip.nextTab = await page.evaluate(() => ({ cls: document.activeElement.className, tag: document.activeElement.tagName }));
    await ctx.close();
  }

  // --- C. position truth deep inside a tall slide, instant scroll ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    out.tall = [];
    for (const [sheet, frac] of [[12, 0.15], [12, 0.45], [12, 0.7], [12, 0.9], [14, 0.1], [14, 0.3], [14, 0.5], [14, 0.7], [14, 0.9]]) {
      const r = await page.evaluate(({ sheet, frac }) => {
        const s = document.getElementById('sheet-' + sheet);
        const h = s.getBoundingClientRect().height;
        const docTop = window.scrollY + s.getBoundingClientRect().top;
        window.scrollTo({ top: Math.round(docTop + h * frac), behavior: 'instant' });
        return { h: Math.round(h), target: Math.round(docTop + h * frac) };
      }, { sheet, frac });
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        let visible = null;
        document.querySelectorAll('.slide').forEach((s) => {
          const r = s.getBoundingClientRect();
          if (r.top <= 1 && r.bottom > 1) visible = s.id;
        });
        return { shown: document.getElementById('idxn').textContent, viewportTopSlide: visible, y: Math.round(window.scrollY) };
      });
      out.tall.push({ sheet, frac, ...r, ...m, lies: m.viewportTopSlide !== 'sheet-' + Number(m.shown) });
    }
    // does "next" skip a sheet from deep inside a tall slide?
    out.skipAhead = [];
    for (const frac of [0.45, 0.8]) {
      await page.evaluate((frac) => {
        const s = document.getElementById('sheet-14');
        const h = s.getBoundingClientRect().height;
        const docTop = window.scrollY + s.getBoundingClientRect().top;
        window.scrollTo({ top: Math.round(docTop + h * frac), behavior: 'instant' });
      }, frac);
      await page.waitForTimeout(250);
      const before = await page.evaluate(() => {
        let v = null; document.querySelectorAll('.slide').forEach((s) => { const r = s.getBoundingClientRect(); if (r.top <= 1 && r.bottom > 1) v = s.id; }); return v;
      });
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(700);
      const after = await page.evaluate(() => {
        let v = null; document.querySelectorAll('.slide').forEach((s) => { const r = s.getBoundingClientRect(); if (Math.abs(r.top) < 3) v = s.id; }); return { landed: v, y: Math.round(window.scrollY), shown: document.getElementById('idxn').textContent };
      });
      out.skipAhead.push({ frac, before, ...after });
    }
    // and "previous" from the top of a tall slide
    await page.evaluate(() => { document.getElementById('sheet-14').scrollIntoView({ behavior: 'instant', block: 'start' }); });
    await page.waitForTimeout(250);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(700);
    out.prevFromTop = await page.evaluate(() => {
      let v = null; document.querySelectorAll('.slide').forEach((s) => { const r = s.getBoundingClientRect(); if (Math.abs(r.top) < 3) v = s.id; }); return { landed: v, shown: document.getElementById('idxn').textContent };
    });
    await ctx.close();
  }

  // --- D. focus-visible ring on a scroller is reachable/visible; and does paging still work once focus sits in a scroller ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelectorAll('.scroller')[0].focus(); });
    const y0 = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    const y1 = await page.evaluate(() => window.scrollY);
    out.pagingBlockedInScroller = { y0, y1, pagedBy: y1 - y0, focusedCls: await page.evaluate(() => document.activeElement.className) };
    await ctx.close();
  }

  // --- E. 390 block-card mode: is the thead clip-path the only overflow, and do headers read? ---
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    out.m390 = await page.evaluate(() => {
      const iw = window.innerWidth;
      const bad = [];
      document.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.right > iw + 0.5) {
          // is it inside a clip-path ancestor?
          let p = el, clipped = false;
          while (p && p !== document.body) { const c = getComputedStyle(p); if (c.clipPath && c.clipPath !== 'none') { clipped = true; break; } p = p.parentElement; }
          bad.push({ tag: el.tagName.toLowerCase(), cls: typeof el.className === 'string' ? el.className : '', right: Math.round(r.right), insideClipPath: clipped });
        }
      });
      const unclipped = bad.filter((b) => !b.insideClipPath);
      const cells = document.querySelectorAll('table.sheet tbody td');
      let missingLabel = 0;
      cells.forEach((c) => { if (!c.getAttribute('data-label')) missingLabel++; });
      return {
        totalOverflow: bad.length, unclippedOverflow: unclipped.length, unclippedSample: unclipped.slice(0, 8),
        docScrollWidth: document.documentElement.scrollWidth, iw,
        tdCells: cells.length, cellsMissingDataLabel: missingLabel,
        idxDisplay: getComputedStyle(document.getElementById('idx')).display,
        tfootCells: document.querySelectorAll('table.sheet tfoot td:not([data-label])').length,
      };
    });
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(DIR, 'r2-report2.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
