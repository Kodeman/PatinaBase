/**
 * Slice 4 review screenshots + scripted acceptance (spec §13 Slice 4:
 * "document state survives sheet open/close intact"). One-off helper.
 *
 *   node scripts/the-document-slice4-shots.mjs
 *
 * Requires: worktree dev server on :3100, slice-3 seed + Olsen claim
 * attribution applied.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-4/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3100';
const WHITFIELD = '66a6b38e-2128-4a39-b598-01af0a54ea04';
const OLSEN = '05364074-614a-443c-90fb-173f4b259f58';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 940 } });

await page.goto(`${BASE}/auth/signin`);
await page.click('text=/sign in with email/i');
try {
  await page.waitForSelector('input[type="password"]', { timeout: 15_000 });
} catch {
  await page.click('[data-testid="auth-mode-toggle"]');
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
}
await page.fill('input[type="email"]', 'designer@patina.dev');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/portal**', { timeout: 60_000 });

// ── Desk: folder tabs carry the R15 fill-state mark ──
await page.goto(`${BASE}/desk`);
await page.waitForSelector('a[href^="/doc/"]', { timeout: 60_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}desk-fill-marks.png`, fullPage: true });

// ── Whitfield: line unfold (PO grid + actions) ──
await page.goto(`${BASE}/doc/${WHITFIELD}`);
await page.waitForSelector('[data-active-section]', { timeout: 60_000 });
await page.click('main >> text=Shaker Dining Chairs');
await page.waitForSelector('text=Purchase order', { timeout: 10_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}doc-line-unfold.png`, fullPage: false });

// ── State survival (the slice's acceptance): open Orders sheet over the
//    unfolded document, close it, assert the unfold is still open ──
await page.click('nav[aria-label="Studio drawer"] >> text=Orders');
await page.waitForSelector('[role="dialog"]', { timeout: 15_000 });
await page.waitForSelector('text=/the studio ledger/', { timeout: 15_000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}orders-sheet-over-document.png`, fullPage: false });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
if (await page.locator('[role="dialog"]').count()) throw new Error('sheet did not close');
if (!(await page.locator('main >> text=Purchase order').count()))
  throw new Error('STATE LOST: line unfold did not survive sheet open/close');
if (!page.url().includes('/doc/')) throw new Error('document unmounted by sheet close');
console.log('✓ acceptance: document state survives sheet open/close intact');

// ── Orders sheet: vendor pane + batch selection ──
await page.click('nav[aria-label="Studio drawer"] >> text=Orders');
await page.waitForSelector('text=/the studio ledger/', { timeout: 15_000 });
const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]');
const n = await checkboxes.count();
if (n >= 2) {
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await page.waitForTimeout(400);
}
await page.screenshot({ path: `${OUT}orders-batch-same-truck.png`, fullPage: false });
await page.keyboard.press('Escape');

// ── Note capture from the margin rail ──
await page.click('aside[aria-label="Margin"] >> text=+ Note');
await page.waitForSelector('textarea[aria-label="Note body"]', { timeout: 10_000 });
await page.fill(
  'textarea[aria-label="Note body"]',
  'Sarah wants pricing on a second pendant for the stair landing.',
);
await page.screenshot({ path: `${OUT}doc-note-compose.png`, fullPage: false });
await page.click('aside[aria-label="Margin"] >> text=/^Save$/');
await page.waitForSelector('aside[aria-label="Margin"] >> text=/second pendant/', {
  timeout: 20_000,
});
console.log('✓ note captured into the margin');

// Escalate it to a client decision (R14, in place)
await page.click('aside[aria-label="Margin"] >> text=/second pendant/');
await page.waitForSelector('text=→ Client decision', { timeout: 10_000 });
await page.click('text=→ Client decision');
await page.waitForSelector('aside[aria-label="Margin"] >> text=/Note · escalated/i', {
  timeout: 20_000,
});
console.log('✓ note escalated to a draft client decision');
await page.screenshot({ path: `${OUT}doc-note-escalated.png`, fullPage: false });

// ── Olsen: truthful per-item DAMAGED ──
await page.goto(`${BASE}/doc/${OLSEN}`);
await page.waitForSelector('[data-active-section]', { timeout: 60_000 });
await page.waitForSelector('main >> text=/Damaged/i', { timeout: 20_000 });
await page.click('main >> text=Cloud Pendant Cluster 19');
await page.waitForSelector('text=/Open claim/', { timeout: 10_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}doc-damaged-per-item.png`, fullPage: false });
console.log('✓ DAMAGED stamps exactly the attributed line');

// ── Mobile ──
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/doc/${WHITFIELD}`);
await page.waitForSelector('[data-active-section]', { timeout: 60_000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}doc-mobile.png`, fullPage: true });

await browser.close();
console.log(`Saved screenshots to ${OUT}`);
