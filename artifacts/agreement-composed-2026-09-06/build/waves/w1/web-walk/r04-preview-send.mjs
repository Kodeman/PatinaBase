/** Walk steps 8 and 9 — preview the client copy, then send. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib2.mjs';

const { proposalId } = JSON.parse(fs.readFileSync(`${HERE}/r2-walk-p1.json`, 'utf8'));
const doSend = process.argv.includes('--send');
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('response', async (r) => {
  if (!/rest\/v1\/rpc\/(send_commercial_document|upsert_agreement_parts)/.test(r.url())) return;
  let t = ''; try { t = (await r.text()).slice(0, 300); } catch {}
  console.log('RPC', r.url().split('/rpc/')[1], r.status(), t.slice(0, 200));
});
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);

// Step 8 — Preview client copy
await page.getByRole('button', { name: /Preview client copy/i }).click();
await page.waitForTimeout(2000);
await shot(page, 'r09-step8-preview-1280');
const preview = await page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop();
  return (d ?? document.body).innerText;
});
console.log('--- PREVIEW ---\n' + preview.slice(0, 2500));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1000);
await shot(page, 'r09-step8-preview-390');
await page.setViewportSize({ width: 1280, height: 900 });
await page.keyboard.press('Escape');
await page.waitForTimeout(1000);

if (!doSend) { await b.close(); process.exit(0); }

// Step 9 — Send
await page.getByRole('button', { name: /review & send/i }).first().click();
await page.waitForTimeout(2500);
await shot(page, 'r09-step9-send-sheet-1280');
console.log('--- SEND SHEET ---\n' + (await page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop();
  return (d ?? document.body).innerText;
})).slice(0, 1800));
const sendBtn = page.getByRole('button', { name: /^Send agreement/ });
console.log('SEND ENABLED:', !(await sendBtn.isDisabled()));
await sendBtn.click();
await page.waitForTimeout(9000);
console.log('URL after send:', page.url());
await shot(page, 'r09-step9-after-send-1280');
await b.close();
