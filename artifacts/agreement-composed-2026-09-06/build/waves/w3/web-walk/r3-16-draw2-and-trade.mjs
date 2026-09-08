import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib3.mjs';

const P = '8cac8743-9b06-40ba-aeab-aa6a1829070b';
const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\/(issue_agreement|record_agreement|create_trade|send_trade|mint_trade)/.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 600); } catch { /* body gone */ }
    console.log('NET', u.split('/rpc/')[1], r.status(), b);
  }
});
await page.goto(`${DESIGNER}/drafting/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
await dismissOverlays(page);
console.log('room url at executed:', page.url());
await shot(page, 'r3-16a-room-executed');
const t = await textOf(page);
console.log('=== ROOM AT executed · right rail ===');
const right = await page.evaluate(() => {
  const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return m ? m.children[2].innerText : '';
});
console.log(right.split("THE CLIENT'S COPY")[0]);
const acts = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button')).map((b) => ({
    t: (b.innerText || '').trim().replace(/\n/g, ' ').slice(0, 50),
    disabled: b.disabled,
  })).filter((b) => b.t),
);
console.log('BUTTONS:', JSON.stringify(acts, null, 0).slice(0, 2500));
console.log('room names Trade Agreements:', /TRADE AGREEMENTS/.test(t));
await browser.close();
