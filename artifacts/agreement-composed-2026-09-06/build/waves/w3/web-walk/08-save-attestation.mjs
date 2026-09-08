import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(`${DESIGNER}/desk?account=studio`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);
await page.waitForTimeout(1500);

await page.selectOption('#studio-credential-type', 'WI Dwelling Contractor');
await page.fill('#studio-credential-number', '1234567');
await page.fill('#studio-credential-state', 'WI');
await page.fill('#studio-credential-expiry', '2027-03-31');
await page.locator('[data-action-region="studio-licensing"]').first();
await page
  .locator('label', { hasText: 'I attest this credential is current' })
  .locator('input[type="checkbox"]')
  .check();
await page.waitForTimeout(600);
await shot(page, '08a-attestation-filled');
await page.locator('[data-action-key="save-studio-attestation"]').click();
await page.waitForTimeout(4000);
await shot(page, '08b-attestation-saved');

// re-open fresh to prove it re-reads
const page2 = await ctx.newPage();
await page2.goto(`${DESIGNER}/desk?account=studio`, { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(10000);
await dismissOverlays(page2);
await page2.waitForTimeout(1500);
const vals = await page2.evaluate(() => ({
  type: document.querySelector('#studio-credential-type')?.value ?? null,
  number: document.querySelector('#studio-credential-number')?.value ?? null,
  state: document.querySelector('#studio-credential-state')?.value ?? null,
  expiry: document.querySelector('#studio-credential-expiry')?.value ?? null,
  checked: document.querySelector('input[type="checkbox"][class="mt-1"]')?.checked ?? null,
}));
console.log('re-read:', JSON.stringify(vals));
await shot(page2, '08c-attestation-reread');
await browser.close();
