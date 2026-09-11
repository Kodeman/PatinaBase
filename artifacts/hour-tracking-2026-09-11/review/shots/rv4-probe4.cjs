const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URL = 'file://' + OUT + '/_rv4wrapped.html';
const out = {};
(async () => {
  const browser = await chromium.launch();
  // sticky gutter overlap at narrow widths
  for (const w of [390, 900, 1000]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(500);
    await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
    out['sticky-' + w] = await page.evaluate(() => {
      const sl = document.querySelectorAll('.slide')[13]; // sheet 14
      window.scrollTo(0, sl.offsetTop + 1500);
      const g = sl.querySelector('.gutter');
      const gr = g.getBoundingClientRect();
      const cs = getComputedStyle(g);
      // what is directly under the gutter's centre point?
      const under = document.elementsFromPoint(gr.left + 20, gr.top + gr.height / 2).map(e => e.tagName + '.' + String(e.className || '').slice(0, 20));
      return { pos: cs.position, top: Math.round(gr.top), bg: cs.backgroundColor,
               gutterText: g.textContent.replace(/\s+/g, ' ').trim(), under,
               overlapping: under.some(t => /TD|TABLE|TR|SPAN\.t-body|P\.t-body/.test(t)) };
    });
    await page.screenshot({ path: `${OUT}/rv4-${w}-stickyoverlap.png` });
    await ctx.close();
  }
  // horizontal displacement hazard: focus / anchor jump at 390
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(500);
    const before = await page.evaluate(() => ({ sl: document.body.scrollLeft, sx: window.scrollX }));
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const afterSkip = await page.evaluate(() => ({ sl: document.body.scrollLeft, sx: window.scrollX, focus: document.activeElement.id || document.activeElement.className }));
    const forced = await page.evaluate(() => { document.querySelector('.mq').scrollIntoView({ block: 'center', inline: 'end' }); return { sl: document.body.scrollLeft, sx: window.scrollX }; });
    const canUserScrollBack = await page.evaluate(() => { const b = document.body; const start = b.scrollLeft; b.scrollLeft = 0; const after = b.scrollLeft; b.scrollLeft = start; return { start, afterSettingZero: after }; });
    out.hshift = { before, afterSkip, forced, canUserScrollBack };
    await page.screenshot({ path: OUT + '/rv4-390-hshift.png' });
    await ctx.close();
  }
  require('fs').writeFileSync(OUT + '/rv4-report4.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
