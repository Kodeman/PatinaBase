/** r2 · walk steps 1-3: create a fresh design-services draft, open the Contract Room.
 *  Also records what the FIRST open renders (M5). */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib2.mjs';

const STATE = `${HERE}/r2-state-designer.json`;
const b = await browser();
const c = await ctx(b, { storageState: STATE });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 250));
});

await page.goto('http://localhost:3000/desk', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);
const skip = page.getByRole('button', { name: /skip for now/i });
if (await skip.count()) {
  await skip.first().click();
  await page.waitForTimeout(1000);
}

await page.evaluate(() =>
  window.dispatchEvent(new CustomEvent('document:open-draft-proposal')),
);
await page.waitForSelector('[data-testid="draft-proposal-layer"]', { timeout: 20000 });
await page.waitForTimeout(800);
await shot(page, 'r01-draft-agreement-sheet');

const layer = page.locator('[data-testid="draft-proposal-layer"]');
const combo = layer.locator('[role="combobox"], button:not([data-testid])').last();
await combo.click();
await page.waitForTimeout(1200);
const search = page.locator('input[placeholder*="earch" i]').last();
if (await search.count()) await search.fill(process.argv[2] ?? 'Client');
await page.waitForTimeout(1800);
const opts = await page.$$eval('[role="option"]', (ns) =>
  ns.map((n) => n.textContent?.trim().slice(0, 60)),
);
console.log('OPTIONS', JSON.stringify(opts));
await page.getByRole('option', { name: new RegExp(process.argv[3] ?? 'Client User', 'i') }).first().click();

await page.waitForURL(/\/drafting\//, { timeout: 60000 });
const proposalId = page.url().split('/drafting/')[1].split(/[?#]/)[0];
console.log('PROPOSAL_ID', proposalId);
fs.writeFileSync(
  `${HERE}/r2-walk-${process.argv[4] ?? 'p1'}.json`,
  JSON.stringify({ proposalId }, null, 2),
);

// FIRST OPEN — M5. Wait for the nav, then read the rail without reloading.
await page.waitForSelector('nav[aria-label="Agreement parts"]', { timeout: 120000 });
await page.waitForTimeout(6000);
const first = await page.$$eval('nav[aria-label="Agreement parts"] li', (ns) => ns.length);
const firstReadiness = await page
  .$eval('section[aria-label="Agreement readiness"]', (n) => n.innerText.replace(/\n+/g, ' | '))
  .catch(() => '(none)');
console.log(`FIRST OPEN: rail rows = ${first}; readiness = ${firstReadiness}`);
await shot(page, `r02-firstopen-${process.argv[4] ?? 'p1'}`);

// Reload — the state the rest of the walk uses.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('nav[aria-label="Agreement parts"] li', { timeout: 120000 });
await page.waitForTimeout(2500);
await shot(page, 'r02-contract-room-1280');

const rail = await page.$$eval('nav[aria-label="Agreement parts"] li', (ns) =>
  ns.map((n) => n.innerText.replace(/\n+/g, ' | ')),
);
console.log('RAIL ROWS AFTER RELOAD (' + rail.length + ')');
rail.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
console.log(
  'READINESS:\n' +
    (await page.$eval('section[aria-label="Agreement readiness"]', (n) => n.innerText)),
);
console.log('HEADING:', await page.$eval('h1', (n) => n.textContent));

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await shot(page, 'r02-contract-room-390');

await c.storageState({ path: STATE });
await b.close();
