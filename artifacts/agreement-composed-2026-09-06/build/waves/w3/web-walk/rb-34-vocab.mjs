import { launch, dismissOverlays, DESIGNER, CLIENT, HERE } from './lib2.mjs';
import fs from 'node:fs';

const TRADE = '7647f2577f6aa43254029ff015728529cbdbe1badd794a8af0755feddf2e2af0';
const out = {};

{
  const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
  const room = await ctx.newPage();
  await room.goto(fs.readFileSync(`${HERE}/r2-turnkey-draft-url.txt`, 'utf8').trim(), {
    waitUntil: 'domcontentloaded',
  });
  await room.waitForTimeout(13000);
  await dismissOverlays(room);
  out.designerTurnkeyRoom = await room.evaluate(() => document.body.innerText);

  const exec = await ctx.newPage();
  await exec.goto(`${DESIGNER}/drafting/95390bd8-86e4-4a0b-9595-9dd5657cc51e`, {
    waitUntil: 'domcontentloaded',
  });
  await exec.waitForTimeout(13000);
  await dismissOverlays(exec);
  out.designerExecutedRoom = await exec.evaluate(() => document.body.innerText);

  const acct = await ctx.newPage();
  await acct.goto(`${DESIGNER}/desk?account=studio`, { waitUntil: 'domcontentloaded' });
  await acct.waitForTimeout(12000);
  await dismissOverlays(acct);
  out.designerAccount = await acct.evaluate(() => document.body.innerText);
  await browser.close();
}
{
  const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
  const door = await ctx.newPage();
  await door.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
  await door.waitForTimeout(11000);
  out.clientDoor = await door.evaluate(() => document.body.innerText);
  const rf = door.getByText(/read (it )?in full/i).first();
  if (await rf.count()) {
    await rf.click();
    await door.waitForTimeout(4500);
    out.clientPaper = await door.evaluate(() => document.body.innerText);
  }
  await browser.close();
}
{
  const { browser, ctx } = await launch();
  const t = await ctx.newPage();
  await t.goto(`${CLIENT}/trade/${TRADE}`, { waitUntil: 'domcontentloaded' });
  await t.waitForTimeout(8000);
  out.tradePage = await t.evaluate(() => document.body.innerText);
  await browser.close();
}
fs.writeFileSync(`${HERE}/r2-rendered-text.json`, JSON.stringify(out, null, 1));

const STUDIO_BANNED = [
  ['clause library', /clause librar/i],
  ['contract builder', /contract builder/i],
  ['variant', /\bvariant\b/i],
  ['bare AI', /\bAI\b/],
  ['snake_case column', /\b[a-z]+_[a-z_]+\b/],
  ['SCREAMING variant key', /\b[A-Z]+_[A-Z_]+\b/],
  ['emoji', /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}]/u],
  ['checkmark', /[✓✔☑✅]/u],
  ['ruling id', /\bR\d{1,2}\b/],
];
const HOMEOWNER_BANNED = [
  ['gate', /\bgate\b/i],
  ['task', /\btask\b/i],
  ['dashboard', /\bdashboard\b/i],
  ['overdue', /\boverdue\b/i],
  ...STUDIO_BANNED,
];

const check = (label, text, rules) => {
  console.log(`\n===== ${label} =====`);
  let clean = true;
  for (const [name, re] of rules) {
    const m = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
    if (m) {
      clean = false;
      const uniq = [...new Set(m)].slice(0, 8);
      console.log(`  HIT ${name}: ${JSON.stringify(uniq)}`);
      for (const hit of uniq.slice(0, 3)) {
        const i = text.indexOf(hit);
        console.log(`      …${text.slice(Math.max(0, i - 70), i + 70).replace(/\n/g, ' ')}…`);
      }
    }
  }
  if (clean) console.log('  clean');
};

check('designer · turnkey Contract Room (draft)', out.designerTurnkeyRoom, STUDIO_BANNED);
check('designer · Contract Room (executed)', out.designerExecutedRoom, STUDIO_BANNED);
check('designer · Account → Studio', out.designerAccount, STUDIO_BANNED);
check("homeowner's door", out.clientDoor, HOMEOWNER_BANNED);
check("homeowner's paper", out.clientPaper ?? '', HOMEOWNER_BANNED);
check('the sub · /trade/[token]', out.tradePage, HOMEOWNER_BANNED);

const DISCLAIMER =
  'Patina helps you assemble and send agreements from parts you write and own. It is not a law firm and does not give legal advice — have an attorney review your templates before first use.';
console.log('\n===== the disclaimer =====');
console.log('verbatim on Account → Studio:', out.designerAccount.includes(DISCLAIMER));
console.log('a word count appears anywhere:', /\b\d{1,3}[- ]word\b/i.test(out.designerAccount));
