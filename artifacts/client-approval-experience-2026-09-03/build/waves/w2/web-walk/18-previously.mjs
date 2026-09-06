import { open, signIn, openHouse, t } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const prev = page.locator('[data-testid="previously-line"]');
console.log('previously lines:', await prev.count());
// open a SIGNED instrument's reading
for (const line of await prev.all()) {
  const state = t(await line.locator('[data-testid="previously-state"]').first().innerText().catch(() => ''));
  if (state !== 'SIGNED') continue;
  console.log('opening SIGNED line:', t(await line.innerText()).slice(0, 120));
  await line.scrollIntoViewIfNeeded();
  const btn = line.locator('button').first();
  if (await btn.count()) await btn.click(); else await line.click();
  await page.waitForTimeout(1600);
  break;
}
await page.screenshot({ path: `${SH}/19-previously-open.png` });
const body = page.locator('[data-testid="previously-body"]').first();
console.log('body count:', await body.count());
if (await body.count()) {
  console.log('--- reading ---');
  console.log(t(await body.innerText()).slice(0, 900));
  await body.screenshot({ path: `${SH}/19b-previously-reading.png` });
}
// stamp pigments + forbidden marks anywhere in Previously
const audit = await page.evaluate(() => {
  const root = document.querySelector('[data-testid="previously"]') || document.body;
  const svgs = [...root.querySelectorAll('svg')].map((s) => s.getAttribute('class') || s.querySelector('title')?.textContent || 'svg');
  const sage = [];
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    for (const p of ['color', 'backgroundColor', 'borderColor']) {
      const v = cs[p];
      const m = v.match(/rgba?\((\d+), (\d+), (\d+)/);
      if (!m) continue;
      const [r, g, b] = [ +m[1], +m[2], +m[3] ];
      // sage / green: green channel clearly dominant
      if (g > r + 12 && g > b + 12 && !(r === 0 && g === 0 && b === 0)) sage.push(`${el.tagName}.${(el.className||'').toString().slice(0,30)} ${p}=${v}`);
    }
  }
  const states = [...root.querySelectorAll('[data-testid="previously-state"]')].map((e) => ({ word: e.textContent.trim(), color: getComputedStyle(e).color }));
  return { svgCount: svgs.length, svgs: svgs.slice(0, 12), sage: [...new Set(sage)].slice(0, 12), states };
});
console.log('SVG icons in Previously:', audit.svgCount, JSON.stringify(audit.svgs));
console.log('green/sage pigments     :', JSON.stringify(audit.sage));
console.log('state words + ink       :', JSON.stringify(audit.states));
await browser.close();
