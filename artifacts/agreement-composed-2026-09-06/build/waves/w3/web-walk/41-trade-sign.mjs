import { launch, shot, CLIENT } from './lib.mjs';

const TOKEN = '6613a3ff054140dd115cf27b9e3712b71d76dfc65c51e35920679600157a7396';
const URL = `${CLIENT}/trade/${TOKEN}`;
const { browser, ctx } = await launch();
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(8000);
await p.locator('input[type="text"]').first().fill('Marta Reyes');
await p.waitForTimeout(600);
const btn = p.getByRole('button', { name: /SIGN THIS AGREEMENT/i }).first();
const box = await btn.boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await p.mouse.down();
await p.waitForTimeout(3500);
await p.mouse.up();
await p.waitForTimeout(9000);
await shot(p, '41a-trade-signed');
console.log('=== after signing ===');
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 1800));

// second load in a fresh clean profile — the link must be spent
const { browser: b2, ctx: c2 } = await launch();
const q = await c2.newPage();
await q.goto(URL, { waitUntil: 'domcontentloaded' });
await q.waitForTimeout(8000);
await shot(q, '41b-trade-reload-spent');
const t2 = await q.evaluate(() => document.body.innerText);
console.log('=== fresh load of the same URL ===');
console.log(t2.slice(0, 1800));
const signable = await q.evaluate(() => ({
  textInputs: document.querySelectorAll('input[type="text"]').length,
  signButtons: Array.from(document.querySelectorAll('button')).filter((b) => /sign this agreement/i.test(b.innerText)).length,
}));
console.log('SIGNABLE-FORM-PRESENT:', JSON.stringify(signable));
await b2.close();
await browser.close();
