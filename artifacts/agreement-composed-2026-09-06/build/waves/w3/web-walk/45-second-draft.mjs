import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';
import fs from 'node:fs';

const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
const right = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[2].innerText : '';
  });
const openPart = async (n) => {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: n }).first().click();
  await page.waitForTimeout(800);
};

await page.goto(`${DESIGNER}/desk`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await dismissOverlays(page);
await page.getByText('FIND ANYTHING', { exact: false }).first().click();
await page.waitForTimeout(1200);
await page.locator('input').last().fill('agreement');
await page.waitForTimeout(1200);
await page.locator('[role="dialog"][aria-label="Command bar"]').getByText('Draft a design agreement').first().click();
await page.waitForTimeout(2500);
await page.locator('[data-testid="client-picker-trigger"]').click();
await page.waitForTimeout(1200);
await page.locator('[role="dialog"]').getByText('Client User', { exact: true }).first().click();
await page.waitForTimeout(10000);
const url = page.url();
console.log('second draft:', url);
fs.writeFileSync(`${HERE}/second-draft-url.txt`, url);

// (e) half two — R33/R39: a HIDDEN fee part, and readiness names it
await openPart('Role rates');
const rows = await page.evaluate(() => {
  const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return Array.from(m.children[1].querySelectorAll('input,button')).map((e) => ({
    aria: e.getAttribute('aria-label'), ph: e.getAttribute('placeholder'), t: (e.innerText || '').slice(0, 30),
  }));
});
console.log('role-rate controls:', JSON.stringify(rows));
await shot(page, '45a-role-rates');
console.log('\n=== readiness before hiding the fee ===');
console.log((await right()).split("THE CLIENT'S COPY")[0]);
await browser.close();
