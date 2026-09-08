import { launch, shot, textOf, CLIENT, HERE } from './lib3.mjs';
const { browser, ctx } = await launch({ state: `${HERE}/r3-client-state.json` });
const page = await ctx.newPage();
let aborted = 0;
await ctx.route('**/rest/v1/rpc/list_client_proposals*', (route) => { aborted += 1; return route.abort('failed'); });
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(15000);
await shot(page, 'r3-34a-proposals-read-failed');
const t = await textOf(page);
console.log('=== the door with a failed proposals read ===');
console.log(t.slice(0, 2200));
console.log('\naborted list_client_proposals requests:', aborted);
console.log('HAS-RETRY:', /try again|retry|read again|could not|couldn/i.test(t));
console.log('SAYS-EMPTY:', /Nothing waits for your name/i.test(t));
const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button'))
  .map((b)=>(b.innerText||'').trim()).filter((x)=>/again|retry/i.test(x)));
console.log('RETRY BUTTONS:', JSON.stringify(btns));
await browser.close();
