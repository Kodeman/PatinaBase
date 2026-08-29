import { chromium } from '@playwright/test';
import path from 'node:path';
const b = await chromium.launch();
for (const f of [process.argv[2]]) {
  const p = await b.newPage({ viewport: { width: 1560, height: 1000 } });
  await p.goto('file://' + path.resolve(f));
  await p.waitForFunction(() => window.__mockReady === true, null, { timeout: 15000 });
  await p.waitForTimeout(300);
  console.log(f, JSON.stringify(await p.evaluate(() => {
    const h = document.querySelector('#rail-1280 .doors-head');
    const d = document.querySelector('#rail-1280 .door');
    const hr = h.getBoundingClientRect(), dr = d.getBoundingClientRect();
    return { headH: Math.round(hr.height), headScrollH: h.scrollHeight, headBottom: Math.round(hr.bottom), firstDoorTop: Math.round(dr.top), overlap: Math.round(hr.bottom - dr.top) };
  })));
  await p.close();
}
await b.close();
