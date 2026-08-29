import { chromium } from '@playwright/test';
import path from 'node:path';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } });
await p.goto('file://' + path.resolve('./index.html'));
await p.waitForFunction(() => window.__mockReady === true, null, { timeout: 15000 });
await p.evaluate(() => window.__lensSettled());
const read = () => p.evaluate(() => {
  const f = document.getElementById('frame-1440');
  const w = f.querySelector('[data-window]');
  return { h: w.style.getPropertyValue('--lens-reading-window-h'), y: w.style.getPropertyValue('--lens-reading-window-y'),
    sh: f.scrollHeight, ext: f.scrollHeight - f.clientHeight };
});
console.log('after Rest      ', JSON.stringify(await read()));
await p.evaluate(async () => { const f = document.getElementById('frame-1440');
  for (let i = 0; i <= 30; i++) { f.scrollTo({ top: Math.round((f.scrollHeight - f.clientHeight) * i / 30), behavior: 'auto' }); await window.__lensSettled(); } });
await p.evaluate(async () => { document.getElementById('frame-1440').scrollTo({ top: 0, behavior: 'auto' }); await window.__lensSettled(); });
console.log('after a full read', JSON.stringify(await read()));
await p.evaluate(async () => { const f = document.getElementById('frame-1440'); f.scrollTo({ top: f.scrollHeight, behavior: 'auto' }); await window.__lensSettled(); });
console.log('at the foot     ', JSON.stringify(await read()));
await b.close();
