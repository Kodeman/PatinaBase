import { launch, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);

const dump = async (label) => {
  const out = await page.evaluate(() => {
    const main = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    const c = main.children[1];
    return {
      text: c.innerText,
      ctrls: Array.from(c.querySelectorAll('input, select, textarea, button')).map((e) => ({
        tag: e.tagName, aria: e.getAttribute('aria-label'), ph: e.getAttribute('placeholder'),
        type: e.type, val: String(e.value).slice(0, 20), txt: (e.innerText || '').slice(0, 40),
        opts: e.tagName === 'SELECT' ? Array.from(e.options).map((o) => o.value) : undefined,
      })),
    };
  });
  console.log(`\n======== ${label} ========`);
  console.log(out.text);
  console.log('CTRLS:', JSON.stringify(out.ctrls));
};

for (const part of ['Draw schedule', 'Allowances', 'Who does the work', 'Supervision', 'Notice of cancellation', 'Lien waiver form']) {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: part }).first().click();
  await page.waitForTimeout(1200);
  await dump(part);
}
await browser.close();
