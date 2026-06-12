/**
 * Slice 3 review screenshots + the scripted Whitfield loop (spec §13 Slice 3
 * acceptance: the prototype's loop end-to-end on real data). One-off helper.
 *
 *   node scripts/the-document-slice3-shots.mjs
 *
 * Requires: dev server on :3000, slice-3 seed applied
 * (scripts/the-document-slice3-seed.sql).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-3/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const WHITFIELD = '66a6b38e-2128-4a39-b598-01af0a54ea04';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 940 } });

// Sign in (password mode; generous first-compile waits)
await page.goto('http://localhost:3000/auth/signin');
await page.click('text=/sign in with email/i');
try {
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
} catch {
  await page.click('[data-testid="auth-mode-toggle"]');
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
}
await page.fill('input[type="email"]', 'designer@patina.dev');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/portal**', { timeout: 30_000 });

// ── The margin, read state ──
await page.goto(`http://localhost:3000/doc/${WHITFIELD}`);
await page.waitForSelector('[data-active-section]', { timeout: 30_000 });
await page.waitForSelector('aside[aria-label="Margin"] >> text=/Pendant finish/', {
  timeout: 30_000,
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}doc-margin-read.png`, fullPage: false });

// Hover the decision → anchored line highlights
const decisionCard = page
  .locator('aside[aria-label="Margin"] div')
  .filter({ hasText: 'Pendant finish' })
  .first();
await decisionCard.hover();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}doc-margin-hover-highlight.png`, fullPage: false });

// ── Act 1: decision — record the client's pick (one act, three surfaces) ──
await page.click('aside[aria-label="Margin"] >> text=/Pendant finish/');
await page.waitForSelector('text=Record the pick', { timeout: 10_000 });
await page.selectOption(`select[aria-label="Client's pick"]`, { label: 'Aged brass' });
await page.selectOption('select[aria-label="How the client told you"]', 'verbal');
await page.fill('input[aria-label="Consent evidence"]', 'Call with Sarah, Thu 9:40 AM');
await page.screenshot({ path: `${OUT}doc-margin-decision-open.png`, fullPage: false });
await page.click('text=Record the pick');

// The pendant line's DECISION DUE stamp must fall to the machine state…
await page.waitForFunction(
  () => !document.querySelector('main')?.textContent?.includes('Decision due'),
  { timeout: 20_000 },
);
// …and the margin item must read responded.
await page.waitForSelector('aside[aria-label="Margin"] >> text=/Decision · responded/i', {
  timeout: 20_000,
});
console.log('✓ decision: line stamp + margin updated from one act');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}doc-margin-decision-resolved.png`, fullPage: false });

// ── Act 2: message reply ──
await page.click('aside[aria-label="Margin"] >> text=/Torn between the two finishes/');
await page.waitForSelector('textarea[aria-label="Reply"]', { timeout: 10_000 });
await page.fill(
  'textarea[aria-label="Reply"]',
  'Aged brass it is — noted from our call. Order goes in today.',
);
await page.click('aside[aria-label="Margin"] >> text=/^Send$/');
await page.waitForSelector('aside[aria-label="Margin"] >> text=/Aged brass it is/', {
  timeout: 20_000,
});
console.log('✓ message: reply landed in the anchored thread');

// ── Act 3: invoice — review & send ──
await page.click('aside[aria-label="Margin"] >> text=/Draft invoice|INV-/');
await page.waitForSelector('text=/Review & send invoice/', { timeout: 10_000 });
await page.click('text=/Review & send invoice/');
await page.waitForSelector('aside[aria-label="Margin"] >> text=/Money · sent/i', {
  timeout: 25_000,
});
console.log('✓ invoice: issued + sent (margin re-read)');

// ── Act 4: the Friday Pulse ──
await page.click('aside[aria-label="Margin"] >> text=/Friday Pulse/');
await page.waitForSelector('textarea[aria-label="Pulse body"]', { timeout: 10_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}doc-margin-pulse-draft.png`, fullPage: false });
await page.click('text=Send Pulse');
await page.waitForSelector('aside[aria-label="Margin"] >> text=/Friday Pulse · sent/i', {
  timeout: 20_000,
});
console.log('✓ pulse: sent + archived in the margin (client mirror via project thread)');
await page.screenshot({ path: `${OUT}doc-margin-after-loop.png`, fullPage: false });

// ── The Desk after the loop ──
await page.goto('http://localhost:3000/desk');
await page.waitForSelector('text=Needs your hand', { timeout: 30_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}desk-after-loop.png`, fullPage: true });

// ── Mobile margin (D12 interim: flows after main) ──
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`http://localhost:3000/doc/${WHITFIELD}`);
await page.waitForSelector('[data-active-section]', { timeout: 30_000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}doc-margin-mobile.png`, fullPage: true });

await browser.close();
console.log(`Saved screenshots to ${OUT}`);
