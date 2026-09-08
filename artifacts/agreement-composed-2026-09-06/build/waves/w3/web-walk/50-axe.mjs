import { launch, shot, dismissOverlays, DESIGNER, CLIENT, HERE } from './lib.mjs';
import fs from 'node:fs';

const AXE = fs.readFileSync(
  '/Users/kody/Code/patina-merged/node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js',
  'utf8',
);
const TRADE = '6613a3ff054140dd115cf27b9e3712b71d76dfc65c51e35920679600157a7396';
const P = '17143662-9354-4f24-87ea-503f818d0bae';

async function audit(page, label) {
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      sample: v.nodes.slice(0, 2).map((n) => n.html.slice(0, 140)),
    }));
  });
  console.log(`\n===== axe · ${label} =====`);
  console.log(JSON.stringify(res, null, 1));
  return res;
}

// 1) the turnkey room — a fresh DRAFT design_build so the composer renders
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const room = await ctx.newPage();
const draftUrl = fs.readFileSync(`${HERE}/turnkey-draft-url.txt`, 'utf8').trim();
await room.goto(draftUrl, { waitUntil: 'domcontentloaded' });
await room.waitForTimeout(12000);
await dismissOverlays(room);
await shot(room, '50a-axe-room');
await audit(room, 'turnkey Contract Room (designer :3000)');
await browser.close();

// 2) the homeowner's door
const { browser: b2, ctx: c2 } = await launch({ state: `${HERE}/client-state.json` });
const door = await c2.newPage();
await door.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await door.waitForTimeout(10000);
await shot(door, '50b-axe-door');
await audit(door, "homeowner's door (client :3002)");
await b2.close();

// 3) the sub's page
const { browser: b3, ctx: c3 } = await launch();
const trade = await c3.newPage();
await trade.goto(`${CLIENT}/trade/${TRADE}`, { waitUntil: 'domcontentloaded' });
await trade.waitForTimeout(8000);
await shot(trade, '50c-axe-trade');
await audit(trade, '/trade/[token]');
await b3.close();
