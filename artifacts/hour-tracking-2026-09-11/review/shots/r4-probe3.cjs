const { createRequire } = require('module');
const req = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = req('@playwright/test');
const fs = require('fs'); const path = require('path');
const DIR = __dirname; const URL = 'file://' + path.join(DIR, '_r3wrapped.html');
(async () => {
  const out = {};
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const where = () => page.evaluate(() => {
    const slides = Array.from(document.querySelectorAll('.slide'));
    let best = null, bd = Infinity;
    for (const s of slides) { const d = Math.abs(s.getBoundingClientRect().top); if (d < bd) { bd = d; best = s; } }
    return best.id + ' off' + Math.round(bd) + ' y=' + Math.round(window.scrollY);
  });
  // rapid presses (real key events, 120ms apart) from the top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1600);
  out.rapid3x120ms_expect_sheet4 = await where();
  // same, well spaced
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1200); }
  out.spaced3x_expect_sheet4 = await where();
  // autorepeat simulation: 8 events 40ms apart
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  for (let i = 0; i < 8; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(40); }
  await page.waitForTimeout(1800);
  out.autorepeat8x40ms_expect_sheet9 = await where();
  // Shift+ArrowRight (text selection) — is it swallowed?
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(900);
  out.shiftArrowRight = await where();
  // End / Home
  await page.keyboard.press('End'); await page.waitForTimeout(1500);
  out.endKey = await where();
  await page.keyboard.press('Home'); await page.waitForTimeout(1500);
  out.homeKey = await where();
  // ArrowLeft from the top of a sheet (should go to previous sheet) and from 60% in
  await page.evaluate(() => document.getElementById('sheet-8').scrollIntoView({block:'start', behavior:'instant'}));
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(1200);
  out.leftFromTopOfSheet8 = await where();
  await page.evaluate(() => { const s=document.getElementById('sheet-8'); window.scrollTo({top: s.offsetTop + (s.offsetHeight - innerHeight)*0.6, behavior:'instant'}); });
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(1200);
  out.leftFrom60pctSheet8 = await where();
  // typing 'k'/'j' while a scroller is focused at 901
  await ctx.close();
  fs.writeFileSync(path.join(DIR,'r4-report3.json'), JSON.stringify(out,null,1));
  console.log(JSON.stringify(out,null,1));
  await b.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
