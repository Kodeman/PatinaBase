import { launch, shot, shot390, dismissOverlays, DESIGNER, HERE } from './lib3.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(`${DESIGNER}/desk?account=studio`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await dismissOverlays(page);
await page.waitForTimeout(2000);

const dlgText = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = nodes[nodes.length - 1];
  return d ? d.innerText : document.body.innerText;
});
console.log('=== ACCOUNT → STUDIO (before) ===');
console.log(dlgText);
await shot(page, 'r3-02a-account-studio-before');

// glyph / vocabulary scan on the rendered text
const banned = ['✓', '✔', '☑', '✅', '❌', '🔴', '🟢'];
console.log('BANNED GLYPHS:', JSON.stringify(banned.filter((g) => dlgText.includes(g))));
const m = dlgText.match(/[✀-➿☀-⛿\u{1F300}-\u{1FAFF}]/gu);
console.log('EMOJI-RANGE HITS:', JSON.stringify(m));

// card order
const order = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = nodes[nodes.length - 1] || document.body;
  return Array.from(d.querySelectorAll('h2, h3, p, div'))
    .map((e) => (e.childElementCount === 0 ? (e.innerText || '').trim() : ''))
    .filter((t) => /^[A-Z][A-Z &→]{3,}$/.test(t));
});
console.log('HEADINGS in order:', JSON.stringify(order));

// STEP 3 — save the attestation
await page.selectOption('#studio-credential-type', 'WI Dwelling Contractor');
await page.fill('#studio-credential-number', '1234567');
await page.fill('#studio-credential-state', 'WI');
await page.fill('#studio-credential-expiry', '2027-03-31');
await page
  .locator('label', { hasText: 'I attest this credential is current' })
  .locator('input[type="checkbox"]')
  .check();
await page.waitForTimeout(600);
await shot(page, 'r3-02b-attestation-filled');
await page.locator('[data-action-key="save-studio-attestation"]').click();
await page.waitForTimeout(5000);
await shot(page, 'r3-02c-attestation-saved');
const after = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = nodes[nodes.length - 1];
  return d ? d.innerText : document.body.innerText;
});
console.log('=== LICENSING after save ===');
console.log(after.split('LICENSING')[1]?.split('\n\n\n')[0]?.slice(0, 1400));

// re-read in a fresh page
const p2 = await ctx.newPage();
await p2.goto(`${DESIGNER}/desk?account=studio`, { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(12000);
await dismissOverlays(p2);
await p2.waitForTimeout(2000);
const vals = await p2.evaluate(() => ({
  type: document.querySelector('#studio-credential-type')?.value ?? null,
  number: document.querySelector('#studio-credential-number')?.value ?? null,
  state: document.querySelector('#studio-credential-state')?.value ?? null,
  expiry: document.querySelector('#studio-credential-expiry')?.value ?? null,
}));
console.log('RE-READ:', JSON.stringify(vals));
await shot(p2, 'r3-02d-attestation-reread');
await shot390(p2, 'r3-02e-attestation-reread-390');
await browser.close();
