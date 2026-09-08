/** Capture the four surfaces under whatever flag set the servers were started
 *  with. Run once per flag configuration; the tag names the file. */
import { launch, shot, dismissOverlays, CLIENT, HERE } from './lib3.mjs';
import fs from 'node:fs';

const TAG = process.argv[2];
const out = {};

{
  const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
  const tk = await ctx.newPage();
  await tk.goto(fs.readFileSync(`${HERE}/r3-turnkey-draft-url.txt`, 'utf8').trim(), {
    waitUntil: 'domcontentloaded',
  });
  await tk.waitForTimeout(13000);
  await dismissOverlays(tk);
  out.turnkeyRoomText = await tk.evaluate(() => document.body.innerText);
  out.turnkeyRoomHtml = await tk.evaluate(() => document.querySelector('main')?.innerHTML ?? document.body.innerHTML);
  await shot(tk, `r3-36-${TAG}-turnkey-room`);

  const sv = await ctx.newPage();
  await sv.goto(fs.readFileSync(`${HERE}/r3-services-draft-url.txt`, 'utf8').trim(), {
    waitUntil: 'domcontentloaded',
  });
  await sv.waitForTimeout(13000);
  await dismissOverlays(sv);
  out.servicesRoomText = await sv.evaluate(() => document.body.innerText);
  out.servicesRoomHtml = await sv.evaluate(() => document.querySelector('main')?.innerHTML ?? document.body.innerHTML);
  await shot(sv, `r3-36-${TAG}-services-room`);
  await browser.close();
}
{
  const { browser, ctx } = await launch({ state: `${HERE}/r3-client-state.json` });
  const door = await ctx.newPage();
  await door.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
  await door.waitForTimeout(11000);
  out.doorText = await door.evaluate(() => document.body.innerText);
  out.doorHtml = await door.evaluate(() => document.body.innerHTML);
  await shot(door, `r3-36-${TAG}-door`);
  await browser.close();
}
fs.writeFileSync(`${HERE}/r3-capture-${TAG}.json`, JSON.stringify(out, null, 1));
console.log(
  TAG,
  'turnkeyRoom bytes', out.turnkeyRoomHtml.length,
  '· servicesRoom bytes', out.servicesRoomHtml.length,
  '· door bytes', out.doorHtml.length,
);
console.log('--- turnkey room text (first 1400) ---');
console.log(out.turnkeyRoomText.slice(0, 1400));
