import { browser, ctx, shot, HERE } from './lib.mjs';
const id = process.argv[2];
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
// warm the route first so the measurement is not a webpack compile
await page.goto('http://localhost:3000/desk', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
const t0 = Date.now();
await page.goto(`http://localhost:3000/drafting/${id}`, { waitUntil: 'domcontentloaded' });
let emptySeenAt = null, filledAt = null;
for (let i = 0; i < 120; i++) {
  const n = await page.locator('nav[aria-label="Agreement parts"] li').count().catch(() => -1);
  const hasEmptyLine = await page.getByText('This agreement has no parts yet.').count().catch(() => 0);
  if (hasEmptyLine && emptySeenAt === null) { emptySeenAt = Date.now() - t0; await shot(page, 'w-firstopen-empty'); }
  if (n === 9) { filledAt = Date.now() - t0; break; }
  await page.waitForTimeout(250);
}
console.log('empty-state first seen at (ms after navigation):', emptySeenAt);
console.log('nine parts rendered at (ms):', filledAt);
await shot(page, 'w-firstopen-filled');
await b.close();
