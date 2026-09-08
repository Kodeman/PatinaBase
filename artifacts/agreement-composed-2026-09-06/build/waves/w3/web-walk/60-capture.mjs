import { launch, shot, dismissOverlays, DESIGNER, CLIENT, HERE } from './lib.mjs';
import fs from 'node:fs';

const tag = process.argv[2] || 'on';
const out = {};
const norm = (h) =>
  h
    .replace(/_r_[0-9a-z]+_/g, '_rID_')
    .replace(/radix-[-_0-9a-zA-Z]+/g, 'radix-ID')
    .replace(/DndDescribedBy-\d+/g, 'DndDescribedBy-N')
    .replace(/\?v=\d+/g, '?v=V')
    .replace(/aria-describedby="[^"]*"/g, 'aria-describedby="X"')
    .replace(/id="[^"]*"/g, 'id="X"')
    .replace(/for="[^"]*"/g, 'for="X"')
    .replace(/data-allowance-id="[^"]*"/g, 'data-allowance-id="X"')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'UUID');

{
  const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
  const room = await ctx.newPage();
  const url = fs.readFileSync(`${HERE}/services-draft-url.txt`, 'utf8').trim();
  await room.goto(url, { waitUntil: 'domcontentloaded' });
  await room.waitForTimeout(12000);
  await dismissOverlays(room);
  out.servicesRoomText = await room.evaluate(() => document.body.innerText);
  out.servicesRoomHtml = norm(
    await room.evaluate(() => document.querySelector('main, body').innerHTML),
  );
  await shot(room, `60-${tag}-services-room`);

  const turnkey = await ctx.newPage();
  await turnkey.goto(fs.readFileSync(`${HERE}/turnkey-draft-url.txt`, 'utf8').trim(), { waitUntil: 'domcontentloaded' });
  await turnkey.waitForTimeout(12000);
  await dismissOverlays(turnkey);
  out.turnkeyRoomText = await turnkey.evaluate(() => document.body.innerText);
  await shot(turnkey, `60-${tag}-turnkey-room`);

  const acct = await ctx.newPage();
  await acct.goto(`${DESIGNER}/desk?account=studio`, { waitUntil: 'domcontentloaded' });
  await acct.waitForTimeout(11000);
  await dismissOverlays(acct);
  out.accountText = await acct.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return d ? d.innerText : document.body.innerText;
  });
  out.accountHtml = norm(
    await acct.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? d.innerHTML : '';
    }),
  );
  await shot(acct, `60-${tag}-account-studio`);
  await browser.close();
}
{
  const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
  const door = await ctx.newPage();
  await door.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
  await door.waitForTimeout(12000);
  out.doorText = await door.evaluate(() => document.body.innerText);
  out.doorHtml = norm(await door.evaluate(() => document.body.innerHTML));
  await shot(door, `60-${tag}-client-door`);
  await browser.close();
}
fs.writeFileSync(`${HERE}/capture-${tag}.json`, JSON.stringify(out, null, 1));
console.log(`captured ${tag}`);
for (const k of Object.keys(out)) console.log(' ', k, out[k].length);
