/** r2 · (a) client half — fill and send a PARTS-LESS agreement from the seven-facet room. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const proposalId = 'e2000000-0000-0000-0000-0000000000a3';
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(upsert_design_services_draft|send_commercial|materialize)/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 150); } catch {}
  console.log('  RPC', r.url().split('/rpc/')[1], r.status(), t.slice(0, 130));
});
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(22000);
console.log('COMPOSER RAIL:', await page.locator('nav[aria-label="Agreement parts"]').count());

const textareas = page.locator('textarea');
await textareas.nth(0).fill('Interior design services for the loft: survey, concept, documentation and selections.');
await page.waitForTimeout(300);
await textareas.nth(1).fill('Concept presentation\nDesign documentation');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /\+ Add a role/ }).click();
await page.waitForTimeout(600);
await page.getByLabel(/Role 1$/).fill('Principal designer');
await page.waitForTimeout(300);
await page.getByLabel(/Principal designer hourly rate|hourly rate/i).first().fill('210');
await page.waitForTimeout(300);
await page.getByLabel(/Design authorization ceiling/i).fill('21000');
await page.waitForTimeout(300);
const last = await textareas.count();
await textareas.nth(last - 1).fill('Ownership of the design documents passes on final payment.');
await page.waitForTimeout(600);
console.log('SHELL:', await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find((n) => n.children.length === 0 && /facets written/i.test(n.textContent || ''));
  return el ? el.textContent.trim() : null;
}));
const save = page.getByRole('button', { name: /^Save agreement$/ });
if ((await save.count()) && !(await save.first().isDisabled())) {
  await save.click();
  await page.waitForTimeout(6000);
}
console.log('NOTES:', JSON.stringify(await page.$$eval('[role="status"],[role="alert"]', (ns) => ns.map((x) => x.innerText).filter(Boolean))));
await shot(page, 'r32-p9-facets-1280');
await page.getByRole('button', { name: /review & send/i }).first().click();
await page.waitForTimeout(3500);
const sendBtn = page.getByRole('button', { name: /^Send agreement/ });
console.log('SEND ENABLED:', !(await sendBtn.isDisabled()));
await shot(page, 'r32-p9-send-sheet');
await sendBtn.click();
await page.waitForTimeout(10000);
console.log('URL', page.url());
await b.close();
