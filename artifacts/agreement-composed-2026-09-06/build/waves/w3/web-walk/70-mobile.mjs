import { launch, shot, dismissOverlays, DESIGNER, CLIENT, HERE } from './lib.mjs';
import fs from 'node:fs';

{
  const { browser, ctx } = await launch({ width: 390, height: 844, state: `${HERE}/designer-state.json` });
  const room = await ctx.newPage();
  await room.goto(fs.readFileSync(`${HERE}/turnkey-draft-url.txt`, 'utf8').trim(), { waitUntil: 'domcontentloaded' });
  await room.waitForTimeout(13000);
  await dismissOverlays(room);
  await shot(room, '70a-turnkey-room-390');
  const acct = await ctx.newPage();
  await acct.goto(`${DESIGNER}/desk?account=studio`, { waitUntil: 'domcontentloaded' });
  await acct.waitForTimeout(12000);
  await dismissOverlays(acct);
  await shot(acct, '70b-account-studio-390');
  await browser.close();
}
{
  const { browser, ctx } = await launch({ width: 390, height: 844, state: `${HERE}/client-state.json` });
  const door = await ctx.newPage();
  await door.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
  await door.waitForTimeout(12000);
  await shot(door, '70c-client-door-390');
  await browser.close();
}
console.log('mobile shots done');
