import { chromium } from '@playwright/test';
import path from 'node:path';
const FILE = 'file://' + path.resolve(process.argv[2] || './index.html');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } });
await p.goto(FILE);
await p.waitForFunction(() => window.__mockReady === true, null, { timeout: 15000 });
await p.evaluate(() => window.__lensSettled && window.__lensSettled());
await p.waitForTimeout(400);
const out = await p.evaluate(() => {
  const r = {};
  ['1440','1280'].forEach(k => {
    const s = document.getElementById('rail-' + k);
    const lad = s.querySelector('.ladder');
    const doors = s.querySelectorAll('.door');
    const last = doors[doors.length - 1];
    const sb = s.getBoundingClientRect();
    r[k] = {
      spineClientH: s.clientHeight, spineScrollH: s.scrollHeight, spineOffsetH: s.offsetHeight,
      ladderTop: lad.offsetTop, ladderH: lad.offsetHeight,
      lastDoorBottom: Math.round(last.getBoundingClientRect().bottom - sb.top),
      slots: [].slice.call(s.querySelectorAll('.seg-slot')).map(e => e.offsetHeight),
      rungH: (s.querySelector('.rung')||{}).offsetHeight,
      css: getComputedStyle(s).padding
    };
  });
  // band-2 text at 390
  const bt = document.querySelector('#frame-390 .band-2-text');
  r.band390 = { sw: bt.scrollWidth, cw: bt.clientWidth, text: bt.textContent };
  const b2 = document.querySelector('#frame-390 .band-2');
  r.band2_390 = { sw: b2.scrollWidth, cw: b2.clientWidth };
  return r;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
