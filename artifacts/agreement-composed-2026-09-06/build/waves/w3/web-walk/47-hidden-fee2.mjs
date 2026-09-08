import { launch, shot, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/second-draft-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
const centre = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[1].innerText : '';
  });
const right = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[2].innerText : '';
  });
const openPart = async (n) => {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: n }).first().click();
  await page.waitForTimeout(800);
};
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await dismissOverlays(page);
await openPart('Role rates');
await page.getByRole('button', { name: '+ Add a role' }).click();
await page.waitForTimeout(500);
await page.getByLabel('Role 1', { exact: true }).fill('Principal');
await page.waitForTimeout(500);
const labels = await page.evaluate(() => {
  const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return Array.from(m.children[1].querySelectorAll('input')).map((e) => e.getAttribute('aria-label'));
});
console.log('input labels after naming the role:', JSON.stringify(labels));
const rate = page.locator('nav[aria-label="Agreement parts"]').locator('xpath=..').locator('input[aria-label$="hourly rate"]').first();
await rate.fill('225.00');
await page.waitForTimeout(1500);
console.log('=== centre with visible fee ===');
console.log(await centre());
console.log('=== readiness ===');
console.log((await right()).split("THE CLIENT'S COPY")[0]);
await page.locator('label', { hasText: 'Hidden from your client' }).locator('input[type="checkbox"]').check();
await page.waitForTimeout(1500);
console.log('\n=== centre with fee HIDDEN ===');
console.log(await centre());
console.log('=== readiness HIDDEN ===');
console.log((await right()).split("THE CLIENT'S COPY")[0]);
await shot(page, '47a-hidden-fee');
await browser.close();
