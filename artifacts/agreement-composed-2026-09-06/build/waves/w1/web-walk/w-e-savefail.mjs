/** Diagnose the Save refusal: capture the RPC response. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib.mjs';

const { proposalId } = JSON.parse(fs.readFileSync(`${HERE}/state-walk.json`, 'utf8'));
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 400)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc/.test(r.url())) return;
  let body = '';
  try {
    body = (await r.text()).slice(0, 900);
  } catch {}
  console.log('RPC', r.status(), r.url().split('/rpc/')[1], '→', body);
});
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('nav[aria-label="Agreement parts"] li', { timeout: 120000 });
await page.waitForTimeout(2500);
// Make it dirty: rename nothing, just re-select a part and tweak the Terms body.
const rail = page.locator('nav[aria-label="Agreement parts"] li');
const n = await rail.count();
console.log('RAIL COUNT', n);
await rail.nth(n - 1).locator('button').nth(1).click();
await page.waitForTimeout(700);
await page.locator('section[aria-label$="editor"] textarea').first().fill('Ownership, cancellation, expenses.');
await page.waitForTimeout(700);
await page.getByRole('button', { name: /^Save agreement$/ }).click();
await page.waitForTimeout(6000);
console.log(
  'STATUS LINES:',
  JSON.stringify(await page.$$eval('[role="status"],[role="alert"]', (ns) => ns.map((x) => x.innerText))),
);
await shot(page, 'we-save-failure-1280');
await b.close();
