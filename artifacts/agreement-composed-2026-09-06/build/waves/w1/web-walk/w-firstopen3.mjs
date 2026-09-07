import { browser, ctx, shot, HERE } from './lib.mjs';
const id = process.argv[2];
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
const page = await c.newPage();
page.on('console', m => console.log(`[${m.type()}]`, m.text().slice(0,300)));
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,400)));
page.on('response', async r => {
  if (!/materialize_standard_parts/.test(r.url())) return;
  let t=''; try{t=await r.text();}catch{}
  console.log('  materialize status', r.status(), 'len', t.length);
  try { const j = JSON.parse(t); console.log('  keys:', Object.keys(j), 'parts type:', Array.isArray(j.parts)?`array(${j.parts.length})`:typeof j.parts); if (Array.isArray(j.parts)&&j.parts[0]) console.log('  part0 keys:', Object.keys(j.parts[0])); } catch(e) { console.log('  parse fail', String(e).slice(0,120)); }
});
await page.goto('http://localhost:3000/desk', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await page.goto(`http://localhost:3000/drafting/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(18000);
console.log('rail rows:', await page.locator('nav[aria-label="Agreement parts"] li').count());
await b.close();
