const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + OUT + '/_rv4wrapped.html';
const out = {};

const PROBE = () => {
  const iw = window.innerWidth;
  function clippedByAncestor(el) {
    let p = el.parentElement;
    while (p) {
      const cs = getComputedStyle(p);
      if (/auto|scroll|hidden|clip/.test(cs.overflowX) || (cs.clipPath && cs.clipPath !== 'none')) return p;
      p = p.parentElement;
    }
    return null;
  }
  const bad = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (r.right <= iw + 0.5 && r.left >= -0.5) continue;
    if (clippedByAncestor(el)) continue;
    bad.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 40),
      text: (el.textContent || '').trim().slice(0, 70),
      left: Math.round(r.left), right: Math.round(r.right), ws: getComputedStyle(el).whiteSpace });
  }
  return { iw, docSW: document.documentElement.scrollWidth, bodySW: document.body.scrollWidth, bad };
};

(async () => {
  const browser = await chromium.launch();

  // 1) unclipped overflow at narrow widths + actual horizontal scrollability + clipping test
  for (const w of [390, 360, 320, 700, 860]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(500);
    out['overflow-' + w] = await page.evaluate(PROBE);
    out['scrollability-' + w] = await page.evaluate(() => {
      window.scrollTo(600, 0);
      const x = window.scrollX;
      const bodyCS = getComputedStyle(document.body);
      const el = document.querySelector('.mq');
      const r = el.getBoundingClientRect();
      return { windowScrollXAfterScrollTo600: x, bodyOverflowX: bodyCS.overflowX,
               htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
               firstMqRight: Math.round(r.right), innerWidth: window.innerWidth,
               firstMqTextCutOff: r.right > window.innerWidth };
    });
    out['mq-' + w] = await page.evaluate(() => [...document.querySelectorAll('.mq')].map(e => ({
      w: Math.round(e.getBoundingClientRect().width), ws: getComputedStyle(e).whiteSpace,
      t: e.textContent.trim().slice(0, 45) })));
    // does forcing white-space:normal on td.mark/.mq remove the page overflow?
    out['fixtest-' + w] = await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '@media (max-width:860px){table.sheet td.mark,.mq{white-space:normal !important}}';
      document.head ? document.head.appendChild(s) : document.body.appendChild(s);
      return { docSW: document.documentElement.scrollWidth, iw: window.innerWidth };
    });
    await ctx.close();
  }

  // 2) keyboard paging
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(400);
    const tops = await page.evaluate(() => [...document.querySelectorAll('.slide')].map(s => Math.round(s.offsetTop)));
    const y = () => page.evaluate(() => Math.round(window.scrollY));
    const seq = [];
    await page.evaluate(() => document.body.focus());
    for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(350); seq.push(await y()); }
    const afterRight = seq.slice();
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(350); const afterLeft = await y();
    await page.keyboard.press('End'); await page.waitForTimeout(500); const afterEnd = await y();
    await page.keyboard.press('Home'); await page.waitForTimeout(500); const afterHome = await y();
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400); const afterHomeThenRight = await y();
    // fast hold
    await page.keyboard.press('Home'); await page.waitForTimeout(600);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(40); }
    await page.waitForTimeout(1200); const afterFast6 = await y();
    out.keyboard = { slideTops: tops, afterRight, afterLeft, afterEnd, afterHome, afterHomeThenRight, afterFast6,
      expectedIndexAfterFast6: 6, top6: tops[6] };
    // j/k
    await page.keyboard.press('Home'); await page.waitForTimeout(600);
    await page.keyboard.press('j'); await page.waitForTimeout(400); const afterJ = await y();
    await page.keyboard.press('k'); await page.waitForTimeout(400); const afterK = await y();
    out.keyboard.afterJ = afterJ; out.keyboard.afterK = afterK;
    // tab order / scroller focusability
    out.keyboard.focusables = await page.evaluate(() =>
      [...document.querySelectorAll('a[href],button,[tabindex]:not([tabindex="-1"])')].map(e => e.tagName + '.' + String(e.className||'').slice(0,24)));
    out.keyboard.scrollerAttrs = await page.evaluate(() => [...document.querySelectorAll('.scroller')].map(e => ({
      tabindex: e.getAttribute('tabindex'), role: e.getAttribute('role'), label: e.getAttribute('aria-label'),
      canScroll: e.scrollWidth > e.clientWidth + 1 })));
    await ctx.close();
  }

  // 3) scroller keyboard trap check at 1440 (focus a scroller, press ArrowRight to its end, then again)
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(400);
    out.scrollerNav = await page.evaluate(() => {
      const s = [...document.querySelectorAll('.scroller')].find(e => e.scrollWidth > e.clientWidth + 1);
      return s ? { tabindex: s.getAttribute('tabindex'), label: s.getAttribute('aria-label'),
                   scrollWidth: s.scrollWidth, clientWidth: s.clientWidth } : null;
    });
    await page.evaluate(() => { const s=[...document.querySelectorAll('.scroller')].find(e=>e.scrollWidth>e.clientWidth+1); s.focus(); });
    const before = await page.evaluate(() => ({ y: Math.round(window.scrollY), sl: Math.round(document.activeElement.scrollLeft) }));
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
    const mid = await page.evaluate(() => ({ y: Math.round(window.scrollY), sl: Math.round(document.activeElement.scrollLeft||-1), ae: document.activeElement.className }));
    await page.evaluate(() => { const s=document.activeElement; s.scrollLeft = s.scrollWidth; });
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400);
    const end = await page.evaluate(() => ({ y: Math.round(window.scrollY) }));
    out.scrollerNav2 = { before, mid, end };
    await ctx.close();
  }

  // 4) sticky gutter sanity at 1440 + print pdf
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(400);
    out.sticky = await page.evaluate(() => {
      const el = document.querySelectorAll('.slide')[2];
      window.scrollTo(0, el.offsetTop + 300);
      const g = el.querySelector('.gutter').getBoundingClientRect();
      return { gutterTop: Math.round(g.top), position: getComputedStyle(el.querySelector('.gutter')).position };
    });
    await page.pdf({ path: OUT + '/rv4-print.pdf', format: 'Letter', printBackground: true });
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(200);
    out.print = await page.evaluate(() => ({
      rootPaper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
      theadPos: getComputedStyle(document.querySelector('table.sheet thead')).position,
      tableDisplay: getComputedStyle(document.querySelector('table.sheet')).display,
      docSW: document.documentElement.scrollWidth, iw: window.innerWidth,
    }));
    await ctx.close();
  }
  require('fs').writeFileSync(OUT + '/rv4-report2.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
