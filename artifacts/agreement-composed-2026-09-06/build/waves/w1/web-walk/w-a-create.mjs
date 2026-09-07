/** Walk steps 1–3: create a fresh design-services draft, open the Contract Room. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib.mjs';

const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

await page.goto('http://localhost:3000/desk', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);
const skip = page.getByRole('button', { name: /skip for now/i });
if (await skip.count()) {
  await skip.first().click();
  await page.waitForTimeout(1000);
}

// The ⌘K verb's own event — `openDraftProposalPicker()` in
// draft-proposal-opener.tsx dispatches exactly this.
await page.evaluate(() =>
  window.dispatchEvent(new CustomEvent('document:open-draft-proposal')),
);
await page.waitForSelector('[data-testid="draft-proposal-layer"]', { timeout: 20000 });
await page.waitForTimeout(800);
await shot(page, 'w01-draft-agreement-sheet');

// The household picker
const layer = page.locator('[data-testid="draft-proposal-layer"]');
console.log(
  'LAYER CONTROLS',
  JSON.stringify(
    await layer.evaluate((n) =>
      [...n.querySelectorAll('button,input,[role="combobox"]')].map((e) => ({
        tag: e.tagName,
        role: e.getAttribute('role'),
        t: (e.textContent || e.placeholder || '').trim().slice(0, 40),
      })),
    ),
  ),
);
const combo = layer.locator('[role="combobox"], button:not([data-testid])').last();
await combo.click();
await page.waitForTimeout(1200);
const search = page.locator('input[placeholder*="earch" i]').last();
if (await search.count()) await search.fill('Client');
await page.waitForTimeout(1500);
await shot(page, 'w01b-household-picker');
const opts = await page.$$eval('[role="option"]', (ns) =>
  ns.map((n) => n.textContent?.trim().slice(0, 60)),
);
console.log('OPTIONS', JSON.stringify(opts));
await page.getByRole('option', { name: /Client User/i }).first().click();

await page.waitForURL(/\/drafting\//, { timeout: 60000 });
const proposalId = page.url().split('/drafting/')[1].split(/[?#]/)[0];
console.log('PROPOSAL_ID', proposalId);
fs.writeFileSync(`${HERE}/state-walk.json`, JSON.stringify({ proposalId }, null, 2));

// The room compiles cold on first visit.
await page.waitForSelector('nav[aria-label="Agreement parts"]', { timeout: 120000 });
await page.waitForTimeout(2500);
await shot(page, 'w02-contract-room-1280');

const rail = await page.$$eval('nav[aria-label="Agreement parts"] li', (ns) =>
  ns.map((n) => n.innerText.replace(/\n+/g, ' | ')),
);
console.log('RAIL ROWS (' + rail.length + ')');
rail.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));

const readiness = await page.$eval('section[aria-label="Agreement readiness"]', (n) =>
  n.innerText,
);
console.log('READINESS:\n' + readiness);

const heading = await page.$eval('h1', (n) => n.textContent);
console.log('HEADING:', heading);

// 390 mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
await shot(page, 'w02-contract-room-390');
await page.setViewportSize({ width: 1280, height: 900 });

await c.storageState({ path: `${HERE}/state-designer.json` });
await b.close();
