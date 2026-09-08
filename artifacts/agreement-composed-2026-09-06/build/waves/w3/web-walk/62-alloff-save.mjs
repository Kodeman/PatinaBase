import { launch, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
for (const [name, file] of [
  ['services draft', 'services-draft-url.txt'],
  ['turnkey draft', 'turnkey-draft-url.txt'],
]) {
  const page = await ctx.newPage();
  await page.goto(fs.readFileSync(`${HERE}/${file}`, 'utf8').trim(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  await dismissOverlays(page);
  const btns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter((b) => /save agreement|review & send/i.test(b.innerText))
      .map((b) => ({ t: b.innerText.trim(), disabled: b.disabled })),
  );
  console.log(name, JSON.stringify(btns));
  await page.close();
}
await browser.close();
