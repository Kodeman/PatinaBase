const { createRequire } = require('module');
const req = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = req('@playwright/test');
const fs=require('fs'), path=require('path');
const DIR=__dirname, URL='file://'+path.join(DIR,'_r3wrapped.html');
(async()=>{
  const b=await chromium.launch();
  // Letter portrait minus 0.4in margins ≈ 7.7in ≈ 739 CSS px; use 816 (8.5in) and 739
  for (const w of [816, 739]) {
    const ctx=await b.newContext({viewport:{width:w,height:1056},colorScheme:'light'});
    const p=await ctx.newPage();
    await p.goto(URL,{waitUntil:'load'});
    await p.evaluate(()=>document.fonts.ready);
    await p.emulateMedia({media:'print'});
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const main = document.querySelector('#sheet-3 .main');
      const rows=[];
      for (const sc of document.querySelectorAll('.scroller')) {
        const t = sc.querySelector('table');
        const tw = t.getBoundingClientRect().width;
        const right = t.getBoundingClientRect().right;
        rows.push({ sheet: sc.closest('section').id, tableW: Math.round(tw), tableRight: Math.round(right),
          scrollerW: Math.round(sc.getBoundingClientRect().width), tableScrollW: t.scrollWidth,
          overflowsPage: right > window.innerWidth + 0.5, display: getComputedStyle(t).display });
      }
      return { viewport: window.innerWidth, mainW: Math.round(main.getBoundingClientRect().width),
        docScrollW: document.documentElement.scrollWidth, rows };
    });
    console.log('=== print @', w, 'main', r.mainW, 'docScrollW', r.docScrollW);
    r.rows.forEach(x => { if (x.overflowsPage || x.tableW > r.mainW + 1) console.log('  ', x.sheet, 'tableW', x.tableW, 'right', x.tableRight, 'display', x.display, 'OVERFLOWS PAGE:', x.overflowsPage); });
    await p.screenshot({ path: path.join(DIR, `r4-print-${w}.png`), fullPage: false });
    await ctx.close();
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
