import { open, signIn, BASE, t } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
for (const id of ['b0000000-0000-0000-0000-0000000cd202', 'b0000000-0000-0000-0000-0000000cd102']) {
  await page.goto(`${BASE}/proposals/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  console.log(`\n${id} → ${page.url()}`);
  console.log('  "has your signature":', (body.match(/has your signature/gi) || []).length);
  console.log('  "countersign":', (body.match(/countersign\w*/gi) || []).length);
  console.log('  SIGNED present:', /\bSIGNED\b/.test(body));
  console.log('  first 260 chars:', body.slice(0, 260));
}
await page.screenshot({ path: `${SH}/26-signed-reading.png`, fullPage: true });
await browser.close();
