import { launch, shot, textOf, CLIENT, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
const page = await ctx.newPage();
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\/|messages|thread/i.test(u) && r.request().method() !== 'GET') {
    let b = '';
    try { b = (await r.text()).slice(0, 300); } catch { /* gone */ }
    console.log('NET', r.request().method(), u.split('/').slice(-1)[0], r.status(), b);
  }
});
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await page.getByText('ASK A QUESTION', { exact: false }).first().click();
await page.waitForTimeout(3000);
await shot(page, 'rb-37a-ask-a-question');
const dlg = await page.evaluate(() => {
  const ds = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = ds[ds.length - 1];
  return d ? d.innerText.slice(0, 1200) : document.body.innerText.slice(0, 1200);
});
console.log('=== ASK A QUESTION ===');
console.log(dlg);
const ta = page.locator('textarea').first();
if (await ta.count()) {
  await ta.fill('Which draw covers the cabinetry, and when is it due?');
  await page.waitForTimeout(600);
  const send = page.getByRole('button', { name: /send|ask|submit/i }).last();
  console.log('send button:', await send.count(), await send.innerText().catch(() => ''));
  await send.click();
  await page.waitForTimeout(8000);
  await shot(page, 'rb-37b-asked');
  console.log('\nafter sending:', (await textOf(page)).slice(0, 900));
}
await browser.close();
