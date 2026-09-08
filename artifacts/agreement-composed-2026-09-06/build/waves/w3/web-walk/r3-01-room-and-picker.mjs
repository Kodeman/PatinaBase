import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib3.mjs';
import fs from 'node:fs';

const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));

await page.goto(`${DESIGNER}/desk`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
await dismissOverlays(page);
await page.getByText('FIND ANYTHING', { exact: false }).first().click();
await page.waitForTimeout(1500);
await page.locator('input').last().fill('agreement');
await page.waitForTimeout(1500);
await page
  .locator('[role="dialog"][aria-label="Command bar"]')
  .getByText('Draft a design agreement')
  .first()
  .click();
await page.waitForTimeout(4000);
await page.locator('[data-testid="client-picker-trigger"]').click();
await page.waitForTimeout(2000);
await page.getByText('Client User', { exact: false }).first().click();
await page.waitForTimeout(12000);
console.log('room url:', page.url());
fs.writeFileSync(`${HERE}/r3-room-url.txt`, page.url());
await shot(page, 'r3-01a-contract-room');

// STEP 1 — the template picker, before any attestation
await page.getByText('Start from a template', { exact: false }).first().click();
await page.waitForTimeout(3000);
await shot(page, 'r3-01b-template-picker-locked');
const dlg = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = nodes[nodes.length - 1];
  if (!d) return null;
  const rows = Array.from(d.querySelectorAll('button')).map((b) => ({
    text: (b.innerText || '').replace(/\n/g, ' | ').slice(0, 240),
    disabled: b.disabled,
    aria: b.getAttribute('aria-disabled'),
  }));
  return { text: d.innerText, rows, links: Array.from(d.querySelectorAll('a')).map((a) => a.innerText + ' -> ' + a.getAttribute('href')) };
});
console.log('--- picker text ---');
console.log(dlg?.text);
console.log('--- picker rows ---');
console.log(JSON.stringify(dlg?.rows, null, 1));
console.log('--- picker links ---');
console.log(JSON.stringify(dlg?.links, null, 1));
console.log('--- FLAG WORDS in picker ---');
console.log(JSON.stringify((dlg?.text || '').match(/flag|feature|design-build|Design-build/g)));
await browser.close();
