import { launch, shot, textOf, CLIENT, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
const page = await ctx.newPage();
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\/(post_|send_|create_)|thread/i.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 300); } catch { /* gone */ }
    console.log('NET', r.request().method(), u.split('/').slice(-1)[0], r.status(), b);
  }
});
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
const before = await textOf(page);
const btn = page.getByRole('button', { name: /^ASK A QUESTION$/i }).first();
console.log('ask button count:', await btn.count());
const href = await page
  .locator('a', { hasText: /ASK A QUESTION/i })
  .first()
  .getAttribute('href')
  .catch(() => null);
console.log('ask link href:', href);
await btn.click();
await page.waitForTimeout(4000);
const after = await textOf(page);
console.log('url:', page.url().replace(CLIENT, ''));
console.log('new text after the click:');
console.log(
  after
    .split('\n')
    .filter((l) => !before.includes(l))
    .join('\n')
    .slice(0, 1200),
);
const tas = await page.evaluate(() =>
  Array.from(document.querySelectorAll('textarea')).map(
    (t) => `${t.getAttribute('aria-label') || t.placeholder || t.id || 'textarea'}`,
  ),
);
console.log('textareas:', JSON.stringify(tas));
await shot(page, 'rb-38-ask-a-question');
await browser.close();
