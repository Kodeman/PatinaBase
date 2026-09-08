import { launch, shot, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/second-draft-url.txt`, 'utf8').trim();
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
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await dismissOverlays(page);

// give the rate card a role + rate so a real fee exists
await openPart('Role rates');
await page.getByRole('button', { name: '+ Add a role' }).click();
await page.waitForTimeout(600);
const c = await page.evaluate(() => {
  const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return Array.from(m.children[1].querySelectorAll('input')).map((e) => ({
    aria: e.getAttribute('aria-label'), ph: e.getAttribute('placeholder'), type: e.type,
  }));
});
console.log('controls:', JSON.stringify(c));
const inputs = page.locator('nav[aria-label="Agreement parts"] ~ * input');
await page.getByLabel('Role 1', { exact: true }).fill('Principal').catch(() => {});
await page.getByLabel('Role 1 hourly rate', { exact: true }).fill('225').catch(() => {});
await page.waitForTimeout(900);
console.log('\n=== readiness with a VISIBLE fee ===');
console.log((await right()).split("THE CLIENT'S COPY")[0]);

// now hide it
await page.locator('label', { hasText: 'Hidden from your client' }).locator('input[type="checkbox"]').check();
await page.waitForTimeout(1200);
console.log('\n=== readiness with the fee HIDDEN ===');
console.log((await right()).split("THE CLIENT'S COPY")[0]);
await shot(page, '46a-hidden-fee-readiness');
await browser.close();
