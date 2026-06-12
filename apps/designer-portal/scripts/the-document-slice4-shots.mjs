/**
 * Slice 4 review screenshots + scripted acceptance (spec v1.2 §13 Slice 4):
 *   - document state survives sheet open/close intact
 *   - a note captured from a line unfold lands anchored to that line
 *   - DAMAGED appears only on items with attributed claims
 *   - R10 constants live on the Desk · R11 personalized override ·
 *     R12 needs-action float + "Settled · N" fold
 * One-off helper.
 *
 *   node scripts/the-document-slice4-shots.mjs
 *
 * Requires: worktree dev server on :3100, migrations 00191–00197 applied,
 * `the-document-local-seed.sql` run. The Whitfield project id is random
 * (activation) — the script resolves it through the R6 redirect.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-4/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3100';
const WHITFIELD_PROPOSAL = 'b0000000-0000-0000-0000-000000000001';
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

// ── Desk: R10 thresholds live + R15 fill marks on the folder tabs ──
await page.goto(`${BASE}/desk`);
await page.waitForSelector('a[href^="/doc/"]', { timeout: 60_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}desk-fill-marks.png`, fullPage: true });

// ── Whitfield via the R6 redirect (activation ids are random) ──
await page.goto(`${BASE}/doc/${WHITFIELD_PROPOSAL}`);
await page.waitForURL((u) => !u.pathname.includes(WHITFIELD_PROPOSAL), { timeout: 60_000 });
await page.waitForSelector('[data-active-section]', { timeout: 60_000 });
const WHITFIELD = page.url().split('/doc/')[1];
console.log(`✓ R6 redirect resolved Whitfield → ${WHITFIELD}`);

// ── Line unfold (PO grid + actions) ──
await page.click('main >> text=Shaker Dining Chairs');
await page.waitForSelector('text=Purchase order', { timeout: 10_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}doc-line-unfold.png`, fullPage: false });

// ── Acceptance: a note captured FROM THE UNFOLD lands anchored to the line ──
await page.click('main >> text=/^\\+ Note$/');
await page.waitForSelector('textarea[aria-label="Note body"]', { timeout: 10_000 });
const placeholder = await page
  .locator('textarea[aria-label="Note body"]')
  .getAttribute('placeholder');
if (!/this line/i.test(placeholder ?? ''))
  throw new Error(`note composer not pre-anchored to the line (placeholder: ${placeholder})`);
await page.fill(
  'textarea[aria-label="Note body"]',
  'Sarah wants pricing on a second pendant for the stair landing.',
);
await page.screenshot({ path: `${OUT}doc-note-compose.png`, fullPage: false });
await page.click('aside[aria-label="Margin"] >> text=/^Save$/');
await page.waitForSelector('aside[aria-label="Margin"] >> text=/second pendant/', {
  timeout: 20_000,
});
console.log('✓ note captured from the unfold into the margin (pre-anchored to the line)');

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

// ── R11: the override action is personal — "Record Sarah's pick" ──
await page.click('aside[aria-label="Margin"] >> text=/Pendant finish/');
await page.waitForSelector(`text=Record Sarah's pick`, { timeout: 15_000 });
console.log("✓ R11: override button reads “Record Sarah's pick”");
await page.screenshot({ path: `${OUT}doc-margin-decision.png`, fullPage: false });
await page.click('aside[aria-label="Margin"] >> text=/Pendant finish/');

// ── Escalate the note → it resolves into the R12 "Settled · N" fold ──
await page.click('aside[aria-label="Margin"] >> text=/second pendant/');
await page.waitForSelector('text=→ Client decision', { timeout: 10_000 });
await page.click('text=→ Client decision');
await page.waitForSelector('aside[aria-label="Margin"] >> text=/Settled · /', {
  timeout: 20_000,
});
if (await page.locator('aside[aria-label="Margin"] >> text=/Note · escalated/i').count())
  throw new Error('escalated note did not fold into Settled (R12)');
await page.click('aside[aria-label="Margin"] >> text=/Settled · /');
await page.waitForSelector('aside[aria-label="Margin"] >> text=/Note · escalated/i', {
  timeout: 10_000,
});
console.log('✓ note escalated to a draft client decision and folded into Settled · N (R12)');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}doc-margin-settled.png`, fullPage: false });

// ── Olsen: truthful per-item DAMAGED ──
await page.goto(`${BASE}/doc/${OLSEN}`);
await page.waitForSelector('[data-active-section]', { timeout: 60_000 });
await page.waitForSelector('main >> text=/Damaged/i', { timeout: 20_000 });
const damagedCount = await page.locator('main >> text=/^Damaged$/i').count();
if (damagedCount > 1) throw new Error(`DAMAGED stamped ${damagedCount} lines — expected 1`);
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
