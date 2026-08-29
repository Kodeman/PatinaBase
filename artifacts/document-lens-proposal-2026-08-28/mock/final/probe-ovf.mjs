import { chromium } from '@playwright/test';
import path from 'node:path';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } });
await p.goto('file://' + path.resolve('./index.html'));
await p.waitForFunction(() => window.__mockReady === true, null, { timeout: 15000 });
await p.evaluate(() => window.__lensSettled && window.__lensSettled());
await p.waitForTimeout(300);
console.log(JSON.stringify(await p.evaluate(() => {
  const vis = e => { const s = getComputedStyle(e); if (s.display==='none'||s.visibility==='hidden') return false; const r=e.getBoundingClientRect(); return r.width>0&&r.height>0; };
  const out = {};
  ['390','1280','1440'].forEach(k => {
    const f = document.getElementById('frame-' + k), fr = f.getBoundingClientRect();
    let n = 0, past = 0; const kinds = {};
    [].slice.call(f.querySelectorAll('*')).forEach(e => {
      if (!vis(e)) return;
      const r = e.getBoundingClientRect();
      if (r.right > fr.right + 1 || r.left < fr.left - 1) past++;
      if (e.scrollWidth > e.clientWidth + 1) { n++; const key = e.className && String(e.className).split(' ')[0] || e.tagName; kinds[key] = (kinds[key]||0)+1; }
    });
    out[k] = { n, past, kinds };
  });
  return out;
})));
await b.close();
