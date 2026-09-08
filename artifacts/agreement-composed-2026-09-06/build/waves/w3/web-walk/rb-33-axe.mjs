import { launch, shot, dismissOverlays, CLIENT, HERE } from './lib2.mjs';
import fs from 'node:fs';

const AXE = fs.readFileSync(
  '/Users/kody/Code/patina-merged/node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js',
  'utf8',
);
const TRADE = '7647f2577f6aa43254029ff015728529cbdbe1badd794a8af0755feddf2e2af0';

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
      sample: v.nodes.slice(0, 2).map((n) => n.html.slice(0, 160)),
    }));
  });
  console.log(`\n===== axe · ${label} =====`);
  console.log(JSON.stringify(res, null, 1));
}

{
  const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
  const room = await ctx.newPage();
  await room.goto(fs.readFileSync(`${HERE}/r2-turnkey-draft-url.txt`, 'utf8').trim(), {
    waitUntil: 'domcontentloaded',
  });
  await room.waitForTimeout(13000);
  await dismissOverlays(room);
  await shot(room, 'r2-32a-axe-room');
  await audit(room, 'turnkey Contract Room (designer :3000)');
  await browser.close();
}
{
  const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
  const door = await ctx.newPage();
  await door.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
  await door.waitForTimeout(10000);
  await shot(door, 'r2-32b-axe-door');
  await audit(door, "homeowner's door (client :3002)");
  await browser.close();
}
{
  const { browser, ctx } = await launch();
  const trade = await ctx.newPage();
  await trade.goto(`${CLIENT}/trade/${TRADE}`, { waitUntil: 'domcontentloaded' });
  await trade.waitForTimeout(8000);
  await shot(trade, 'r2-32c-axe-trade');
  await audit(trade, '/trade/[token]');
  await browser.close();
}
