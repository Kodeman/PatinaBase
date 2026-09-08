import { launch, dismissOverlays, DESIGNER, CLIENT, HERE } from './lib.mjs';
import fs from 'node:fs';

const TRADE = '6613a3ff054140dd115cf27b9e3712b71d76dfc65c51e35920679600157a7396';
const out = {};

// designer surfaces
{
  const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
  const room = await ctx.newPage();
  await room.goto(fs.readFileSync(`${HERE}/turnkey-draft-url.txt`, 'utf8').trim(), { waitUntil: 'domcontentloaded' });
  await room.waitForTimeout(12000);
  await dismissOverlays(room);
  out.designerRoom = await room.evaluate(() => document.body.innerText);
  const acct = await ctx.newPage();
  await acct.goto(`${DESIGNER}/desk?account=studio`, { waitUntil: 'domcontentloaded' });
  await acct.waitForTimeout(11000);
  await dismissOverlays(acct);
  out.designerAccount = await acct.evaluate(() => document.body.innerText);
  await browser.close();
}
// client surfaces
{
  const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
  const door = await ctx.newPage();
  await door.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
  await door.waitForTimeout(11000);
  out.clientDoor = await door.evaluate(() => document.body.innerText);
  await browser.close();
}
// sub surface
{
  const { browser, ctx } = await launch();
  const t = await ctx.newPage();
  await t.goto(`${CLIENT}/trade/${TRADE}`, { waitUntil: 'domcontentloaded' });
  await t.waitForTimeout(8000);
  out.tradePage = await t.evaluate(() => document.body.innerText);
  await browser.close();
}
out.clientFullPaper = fs.readFileSync(`${HERE}/client-full-paper.txt`, 'utf8');

fs.writeFileSync(`${HERE}/rendered-text.json`, JSON.stringify(out, null, 1));

const BANNED = [
  ['variant', /\bvariants?\b/i],
  ['clause library', /clause librar/i],
  ['contract builder', /contract builder/i],
  ['AI', /\bA\.?I\.?\b/],
  ['column name (snake_case)', /\b[a-z]+_[a-z_]+\b/],
  ['emoji', /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u],
  ['checkmark', /[✓✔☑]/],
];
const HOMEOWNER_BANNED = [
  ['gate', /\bgate(d|s)?\b/i],
  ['task', /\btasks?\b/i],
  ['dashboard', /\bdashboards?\b/i],
  ['overdue', /\boverdue\b/i],
];
const DISCLAIMER =
  'Patina helps you assemble and send agreements from parts you write and own. It is not a law firm and does not give legal advice — have an attorney review your templates before first use.';

for (const [surface, text] of Object.entries(out)) {
  const hits = [];
  for (const [name, re] of BANNED) {
    const m = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
    if (m) hits.push(`${name}: ${[...new Set(m)].slice(0, 8).join(' | ')}`);
  }
  if (/client|trade/i.test(surface) || surface === 'clientFullPaper') {
    for (const [name, re] of HOMEOWNER_BANNED) {
      const m = text.match(new RegExp(re.source, `${re.flags}g`));
      if (m) hits.push(`HOMEOWNER ${name}: ${[...new Set(m)].slice(0, 8).join(' | ')}`);
    }
  }
  console.log(`\n=== ${surface} (${text.length} chars) ===`);
  console.log(hits.length ? hits.join('\n') : 'clean');
}
console.log('\nDISCLAIMER verbatim in Account → Studio:', out.designerAccount.includes(DISCLAIMER));
console.log('word-count string in Account → Studio:', /\b(32|34)[- ]word\b/i.test(out.designerAccount));
