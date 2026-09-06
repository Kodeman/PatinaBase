import { open, signIn, openHouse, t } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r2';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
console.log('door-way count now:', await page.locator('[data-testid="door-way"]').count());
const prev = page.locator('[data-testid="previously"]').first();
const c = await prev.count();
console.log('previously count:', c);
const root = c ? prev : page.locator('body');
await root.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(400);
const lines = page.locator('[data-testid="previously-line"]');
const n = await lines.count();
console.log('previously lines:', n);
for (let i = 0; i < n; i++) {
  const l = lines.nth(i);
  console.log(`  [${i}] ${t(await l.innerText())}`);
  const st = l.locator('[data-testid="previously-state"]').first();
  if (await st.count()) console.log(`       state="${t(await st.innerText())}" ink=${await st.evaluate((el) => getComputedStyle(el).color)} bg=${await st.evaluate((el) => getComputedStyle(el).backgroundColor)}`);
}
await page.screenshot({ path: `${SH}/14-previously-open.png`, fullPage: true });

// green sweep + checkmark sweep over the whole Previously region
const audit = await page.evaluate(() => {
  const scope = document.querySelector('[data-testid="previously"]') || document.body;
  const greens = [];
  const parse = (c) => (c.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  for (const el of scope.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    for (const p of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor']) {
      const v = cs[p];
      if (!v || v === 'rgba(0, 0, 0, 0)') continue;
      const [r, g, b] = parse(v);
      if (g > r + 12 && g > b + 12) greens.push({ tag: el.tagName, p, v, txt: (el.textContent || '').trim().slice(0, 30) });
    }
  }
  const svgs = [...scope.querySelectorAll('svg')].map((s) => ({ cls: s.getAttribute('class'), d: (s.querySelector('path')?.getAttribute('d') || '').slice(0, 40) }));
  return { greens, svgs };
});
console.log('green nodes under Previously:', audit.greens.length, JSON.stringify(audit.greens.slice(0, 6)));
console.log('svgs under Previously:', JSON.stringify(audit.svgs));

// open the signed trade scope's reading
const signedLine = lines.filter({ hasText: /Stair and rail/i }).first();
if (await signedLine.count()) {
  await signedLine.click();
  await page.waitForTimeout(1500);
  console.log('--- READING ---');
  console.log(t(await page.locator('main').first().innerText()).slice(0, 900));
  await page.screenshot({ path: `${SH}/14b-previously-reading.png`, fullPage: false });
}
await browser.close();
