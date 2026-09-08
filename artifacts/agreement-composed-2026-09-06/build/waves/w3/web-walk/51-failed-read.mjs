import { launch, shot, CLIENT, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
const page = await ctx.newPage();
let aborted = 0;
await ctx.route('**/rest/v1/rpc/list_client_proposals*', (route) => { aborted += 1; return route.abort('failed'); });
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);
await shot(page, '51a-proposals-read-failed');
const t = await page.evaluate(() => document.body.innerText);
console.log('=== door with a failed proposals read ===');
console.log(t.slice(0, 2500));
console.log('aborted proposals requests:', aborted);
console.log('\nHAS-RETRY:', /try again|retry|couldn.t|could not|again/i.test(t));
await browser.close();
