import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib3.mjs';
import fs from 'node:fs';

const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });

async function newAgreement(page) {
  await page.goto(`${DESIGNER}/desk`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  await dismissOverlays(page);
  await page.getByText('FIND ANYTHING', { exact: false }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('input').last().fill('agreement');
  await page.waitForTimeout(1800);
  await page
    .locator('[role="dialog"][aria-label="Command bar"]')
    .getByText('Draft a design agreement')
    .first()
    .click({ force: true });
  await page.waitForTimeout(6000);
  await page.locator('[data-testid="client-picker-trigger"]').click();
  await page.waitForTimeout(2500);
  await page.locator('input[placeholder="Search or add a client…"]').first().fill('Client User');
  await page.waitForTimeout(3500);
  await page.getByRole('option', { name: /Client User/ }).first().click();
  await page.waitForTimeout(13000);
  return page.url();
}

// a plain design-services draft — the Wave 2 surface
const sv = await ctx.newPage();
const svUrl = await newAgreement(sv);
console.log('services draft url:', svUrl);
fs.writeFileSync(`${HERE}/r3-services-draft-url.txt`, svUrl);
await shot(sv, 'r3-41a-services-draft');

// a turnkey draft, materialized but uncomposed
const tk = await ctx.newPage();
const tkUrl = await newAgreement(tk);
console.log('turnkey draft url:', tkUrl);
fs.writeFileSync(`${HERE}/r3-turnkey-draft-url.txt`, tkUrl);
await tk.getByText('Start from a template', { exact: false }).first().click();
await tk.waitForTimeout(3000);
await tk.getByRole('button', { name: /Design-build turnkey/i }).first().click();
await tk.waitForTimeout(600);
await tk.getByRole('button', { name: /^Use this template$/i }).click();
await tk.waitForTimeout(1500);
const rep = tk.getByRole('button', { name: /^Replace the parts$/i });
if (await rep.count()) await rep.click();
await tk.waitForTimeout(14000);
await shot(tk, 'r3-41b-turnkey-draft');
console.log('ok');
await browser.close();
