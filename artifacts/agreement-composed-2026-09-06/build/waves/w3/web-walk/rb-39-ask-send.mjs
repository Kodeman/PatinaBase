import { launch, shot, textOf, CLIENT, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
const page = await ctx.newPage();
page.on('response', async (r) => {
  const u = r.url();
  if (r.request().method() === 'POST' && /comms|thread|message|question/i.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 400); } catch { /* gone */ }
    console.log('NET POST', u.split('/rest/v1/')[1]?.slice(0, 80) ?? u.slice(-60), r.status(), b);
  }
});
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await page.getByRole('button', { name: /^ASK A QUESTION$/i }).first().click();
await page.waitForTimeout(2500);
await page.locator('textarea').first().fill(
  'Walk round 2 — which draw covers the cabinetry?',
);
await page.waitForTimeout(600);
await shot(page, 'rb-39a-ask-filled');
await page.getByRole('button', { name: /^SEND$/i }).first().click();
await page.waitForTimeout(9000);
await shot(page, 'rb-39b-ask-sent');
const t = await textOf(page);
console.log('door still shows the signable paper:', /SIGN AND ACCEPT/.test(t));
console.log(t.slice(0, 1200));
await browser.close();
