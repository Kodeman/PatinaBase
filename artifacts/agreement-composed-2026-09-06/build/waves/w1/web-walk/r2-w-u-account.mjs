/** (b) Account → Studio: the Agreement defaults card saves and re-reads; Billing card unchanged. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const tag = process.argv[2] ?? 'wu';
const state = process.argv[3] ?? `${HERE}/r2-state-designer.json`;
const b = await browser();
const c = await ctx(b, { storageState: state });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/(rpc|studio_agreement_defaults)/.test(r.url())) return;
  if (!/agreement_default|studio_agreement/i.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 260); } catch {}
  console.log('  NET', r.url().split('/rest/v1/')[1].slice(0, 60), r.status(), t);
});
for (const path of ['/preferences', '/account', '/desk']) {
  await page.goto(`http://localhost:3000${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  if (!/signin|unauthorized/.test(page.url())) {
    const txt = await page.evaluate(() => document.body.innerText);
    if (/agreement defaults/i.test(txt)) { console.log('FOUND at', path); break; }
    console.log(path, '→', page.url(), '· no defaults card');
  }
}
// The account-studio page
await page.goto('http://localhost:3000/preferences', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
console.log('URL', page.url());
console.log('TABS/LINKS:', JSON.stringify((await page.$$eval('a,button', (ns) =>
  ns.map((n) => n.innerText.trim().slice(0, 40)).filter(Boolean))).slice(0, 60)));
await shot(page, `${tag}-preferences`);
console.log('TEXT:\n' + (await page.evaluate(() => document.body.innerText)).slice(0, 1800));
await b.close();
