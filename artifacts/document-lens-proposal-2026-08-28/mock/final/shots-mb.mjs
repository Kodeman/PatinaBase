import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { join, dirname, } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const HERE = dirname(fileURLToPath(import.meta.url));
const URL = pathToFileURL(join(HERE, 'index.html')).href;
mkdirSync(join(HERE, 'shots-mb'), { recursive: true });
const b = await chromium.launch();

/* static-first: JS off, the rest state must still paint */
const ctxNo = await b.newContext({ javaScriptEnabled: false, viewport: { width: 1560, height: 1120 } });
const pn = await ctxNo.newPage();
await pn.goto(URL);
await pn.waitForTimeout(600);
console.log('nojs:', await pn.evaluate ? 'n/a' : 'n/a');
await pn.screenshot({ path: join(HERE, 'shots-mb', 'nojs-rest.png') });
await ctxNo.close();

const p = await b.newPage({ viewport: { width: 1560, height: 1120 } });
await p.goto(URL);
await p.waitForFunction(() => window.__mockReady === true);
await p.evaluate(() => window.__lensSettled());
const shot = async (n, y) => {
  if (y !== undefined) { await p.evaluate(async t => { const f=document.getElementById('frame-1440'); f.scrollTo({top:t,behavior:'auto'}); await window.__lensSettled(); }, y); }
  await p.waitForTimeout(350);
  await p.screenshot({ path: join(HERE, 'shots-mb', n + '.png') });
};
await shot('1440-rest', 0);
await shot('1440-condensed', 400);
await shot('1440-ffe', 1600);
await p.evaluate(() => document.querySelector('#frame-1440 .act[data-open-sheet]').click());
await shot('1440-sheet');
await p.keyboard.press('Escape');
await p.evaluate(() => document.querySelector('.devbtn[data-go="reduced"]').click());
await shot('1440-reduced', 400);
await p.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
/* 1280 */
await p.evaluate(async () => { const f=document.getElementById('frame-1280'); f.scrollTo({top:900,behavior:'auto'}); await window.__lensSettled();
  document.getElementById('frame-1280').scrollIntoView({block:'start'}); });
await p.waitForTimeout(400);
await p.screenshot({ path: join(HERE, 'shots-mb', '1280-reading.png') });
await p.evaluate(() => document.querySelector('#frame-1280 .margin-tab').click());
await p.waitForTimeout(400);
await p.screenshot({ path: join(HERE, 'shots-mb', '1280-margin-sheet.png') });
await p.keyboard.press('Escape');
/* 390 */
await p.evaluate(async () => { const f=document.getElementById('frame-390'); f.scrollTo({top:800,behavior:'auto'}); await window.__lensSettled();
  f.scrollIntoView({block:'start'}); });
await p.waitForTimeout(400);
await p.screenshot({ path: join(HERE, 'shots-mb', '390-reading.png') });
await p.evaluate(() => document.querySelector('#frame-390 .mb-item[data-open-sheet*="sections"]').click());
await p.waitForTimeout(400);
await p.screenshot({ path: join(HERE, 'shots-mb', '390-sections.png') });
await b.close();
console.log('shots written');
