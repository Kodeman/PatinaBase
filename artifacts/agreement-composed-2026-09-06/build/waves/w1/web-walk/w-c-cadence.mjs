/** Observation: the Billing cadence part seeded {"cadence": null}. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib.mjs';

const { proposalId } = JSON.parse(fs.readFileSync(`${HERE}/state-walk.json`, 'utf8'));
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
await page.goto(`http://localhost:3000/drafting/${proposalId}`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForSelector('nav[aria-label="Agreement parts"] li', { timeout: 120000 });
await page.waitForTimeout(2500);
await page.locator('nav[aria-label="Agreement parts"] li').nth(7).locator('button').nth(1).click();
await page.waitForTimeout(1200);
await shot(page, 'wc-cadence-monthly-but-blocked-1280');
console.log('EDITOR:', await page.$eval('section[aria-label$="editor"]', (n) => n.innerText));
console.log(
  'SELECT VALUE:',
  await page.$eval('section[aria-label$="editor"] select', (n) => n.value),
);
console.log(
  'READINESS:\n' +
    (await page.$eval('section[aria-label="Agreement readiness"]', (n) => n.innerText)),
);
console.log(
  'SAVE BUTTON:',
  JSON.stringify(
    await page.$$eval('button', (ns) =>
      ns
        .map((n) => ({ t: n.innerText.trim(), d: n.disabled }))
        .filter((x) => /^Save|^Saved/.test(x.t)),
    ),
  ),
);
await b.close();
