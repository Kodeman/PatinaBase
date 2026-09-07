/** Reopen the Contract Room and read the rail + readiness. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib.mjs';

const { proposalId } = JSON.parse(fs.readFileSync(`${HERE}/state-walk.json`, 'utf8'));
const tag = process.argv[2] ?? 'w03';

const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(`http://localhost:3000/drafting/${proposalId}`, {
  waitUntil: 'domcontentloaded',
});
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
await shot(page, `${tag}-room-1280`);

const rail = await page.$$eval('nav[aria-label="Agreement parts"] li', (ns) =>
  ns.map((n) => n.innerText.replace(/\n+/g, ' | ')),
);
console.log(`RAIL ROWS (${rail.length})`);
rail.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
console.log(
  'READINESS:\n' +
    (await page.$eval('section[aria-label="Agreement readiness"]', (n) => n.innerText)),
);
console.log('SHELL COUNT:', await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find(
    (n) => n.children.length === 0 && /parts need attention/i.test(n.textContent || ''),
  );
  return el ? el.textContent.trim() : null;
}));
console.log('BUTTONS:', JSON.stringify(await page.$$eval('button', (ns) =>
  ns.map((n) => ({ t: n.innerText.trim().slice(0, 40), d: n.disabled })).filter((x) => x.t),
)));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await shot(page, `${tag}-room-390`);
await b.close();
