/** (d) axe on the Contract Room and the homeowner's door. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib.mjs';

const AXE = '/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration/node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js';
const axeSrc = fs.readFileSync(AXE, 'utf8');

const target = process.argv[2]; // 'room' | 'door'
const arg = process.argv[3];
const tag = process.argv[4] ?? `axe-${target}`;

const b = await browser();
const isRoom = target === 'room';
const c = await ctx(b, { storageState: `${HERE}/state-${isRoom ? 'designer' : 'client'}.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

if (isRoom) {
  await page.goto(`http://localhost:3000/drafting/${arg}`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
  await page.waitForTimeout(4000);
} else {
  await page.goto('http://localhost:3002' + (arg && arg !== '-' ? arg : '/'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);
}
await shot(page, `${tag}-scanned`);
await page.addScriptTag({ content: axeSrc });
const res = await page.evaluate(async () =>
  await window.axe.run(document, { resultTypes: ['violations'] }));
console.log(`AXE ${target} — ${res.violations.length} violation rules`);
for (const v of res.violations) {
  console.log(`  [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node(s))`);
  for (const n of v.nodes.slice(0, 3)) {
    console.log(`      ${n.target.join(' ')} :: ${(n.failureSummary ?? '').split('\n').filter(Boolean).slice(0, 2).join(' / ').slice(0, 200)}`);
  }
}
fs.writeFileSync(`${HERE}/${tag}.json`, JSON.stringify(res.violations, null, 1));
await b.close();
