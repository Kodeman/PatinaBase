const { createRequire } = require('module');
const req = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = req('@playwright/test');
const fs=require('fs'), path=require('path');
const DIR=__dirname, URL='file://'+path.join(DIR,'_r3wrapped.html');
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:905,height:900},colorScheme:'light'});
  const p=await ctx.newPage();
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
    const res=[];
    for (const sc of document.querySelectorAll('.scroller')) {
      const over=sc.scrollWidth-sc.clientWidth;
      if (over<=1) continue;
      const t=sc.querySelector('table');
      // widest nowrap cell per column
      const cols=[];
      const headRow=t.tHead.rows[0];
      for (let c=0;c<headRow.cells.length;c++){
        let maxw=0, sample='', nowrap=false;
        for (const row of t.rows){ const cell=row.cells[c]; if(!cell) continue;
          const cs=getComputedStyle(cell); const w=cell.getBoundingClientRect().width;
          // measure intrinsic width of nowrap content
          if (cs.whiteSpace==='nowrap'){ nowrap=true; if (cell.scrollWidth>maxw){maxw=cell.scrollWidth; sample=(cell.textContent||'').trim().slice(0,40);} }
        }
        cols.push({c, head:(headRow.cells[c].textContent||'').trim(), nowrap, maxw:Math.round(maxw), sample});
      }
      res.push({sheet: sc.closest('section').id, over, clientW: sc.clientWidth, scrollW: sc.scrollWidth, cols: cols.filter(x=>x.nowrap)});
    }
    return res;
  });
  console.log(JSON.stringify(r,null,1));
  fs.writeFileSync(path.join(DIR,'r4-report4.json'),JSON.stringify(r,null,1));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
