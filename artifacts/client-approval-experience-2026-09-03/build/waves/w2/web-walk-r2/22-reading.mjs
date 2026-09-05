import { open, signIn, t } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r2';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
for (const id of ['b0000000-0000-0000-0000-0000000cd102', 'b0000000-0000-0000-0000-0000000cd003']) {
  await page.goto(`http://localhost:3002/proposals/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log(`\n== /proposals/${id} → ${page.url()}`);
  console.log(t(await page.locator('main, body').first().innerText()).slice(0, 700));
  const audit = await page.evaluate(() => {
    const parse = (c) => (c.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const greens = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      for (const p of ['color', 'backgroundColor', 'borderTopColor']) {
        const v = cs[p]; if (!v || v === 'rgba(0, 0, 0, 0)') continue;
        const [r, g, b] = parse(v);
        if (g > r + 12 && g > b + 12) greens.push({ tag: el.tagName, p, v, txt: (el.textContent || '').trim().slice(0, 28) });
      }
    }
    const marks = [...document.querySelectorAll('svg')].map((s) => s.getAttribute('class') || '').filter((c) => /check/i.test(c));
    const sage = getComputedStyle(document.documentElement).getPropertyValue('--color-sage').trim();
    return { greens: greens.slice(0, 8), greenCount: greens.length, checkSvgs: marks, sage };
  });
  console.log('greens:', audit.greenCount, JSON.stringify(audit.greens));
  console.log('check-classed svgs:', JSON.stringify(audit.checkSvgs), '| --color-sage =', audit.sage);
  const stamps = page.locator('[data-testid*="stamp"], [data-stamp]');
  for (let i = 0; i < await stamps.count(); i++) {
    const s = stamps.nth(i);
    console.log('  stamp:', t(await s.innerText()), '| ink', await s.evaluate((el) => getComputedStyle(el).color));
  }
  await page.screenshot({ path: `${SH}/22-reading-${id.slice(-5)}.png`, fullPage: true });
}
await browser.close();
