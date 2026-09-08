/** Capture three surfaces under whatever flag set the servers were started with.
 *  Nothing here writes: the drafts are read, never edited. */
import { launch, shot, dismissOverlays, CLIENT, HERE } from './lib3.mjs';
import fs from 'node:fs';

const TAG = process.argv[2];
const out = {};

{
  const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
  const sv = await ctx.newPage();
  await sv.goto(fs.readFileSync(`${HERE}/r3-clean-services-url.txt`, 'utf8').trim(), {
    waitUntil: 'domcontentloaded',
  });
  await sv.waitForTimeout(14000);
  await dismissOverlays(sv);
  out.servicesRoomText = await sv.evaluate(() => document.body.innerText);
  out.servicesRoomHtml = await sv.evaluate(
    () => document.querySelector('main')?.innerHTML ?? document.body.innerHTML,
  );
  await shot(sv, `r3-51-${TAG}-services-room`);

  const tk = await ctx.newPage();
  await tk.goto(fs.readFileSync(`${HERE}/r3-turnkey-draft-url.txt`, 'utf8').trim(), {
    waitUntil: 'domcontentloaded',
  });
  await tk.waitForTimeout(14000);
  await dismissOverlays(tk);
  out.turnkeyRoomText = await tk.evaluate(() => document.body.innerText);
  out.turnkeyRoomHtml = await tk.evaluate(
    () => document.querySelector('main')?.innerHTML ?? document.body.innerHTML,
  );
  await shot(tk, `r3-51-${TAG}-turnkey-room`);
  await browser.close();
}
{
  const { browser, ctx } = await launch({ state: `${HERE}/r3-client-state.json` });
  const door = await ctx.newPage();
  await door.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
  await door.waitForTimeout(12000);
  out.doorText = await door.evaluate(() => document.body.innerText);
  out.doorHtml = await door.evaluate(() => document.body.innerHTML);
  await shot(door, `r3-51-${TAG}-door`);
  await browser.close();
}
fs.writeFileSync(`${HERE}/r3-cap2-${TAG}.json`, JSON.stringify(out, null, 1));
console.log(
  TAG,
  'servicesRoom bytes', out.servicesRoomHtml.length,
  '· turnkeyRoom bytes', out.turnkeyRoomHtml.length,
  '· door bytes', out.doorHtml.length,
);
console.log('--- services room text ---');
console.log(out.servicesRoomText.slice(0, 1600));
