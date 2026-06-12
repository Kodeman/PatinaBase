/**
 * Slice 2 review screenshots (workstream CLAUDE.md: desktop ≥1280 + ~390px
 * of each new surface) + scripted acceptance checks (open-lands-at-active,
 * Esc puts down, sheet-Esc priority). One-off helper, not part of any build.
 *
 *   node scripts/the-document-slice2-shots.mjs
 *
 * Engagement ids are the local seed set (post `activate_proposal_as_project`
 * enrichment of the sample accepted proposal — see slice 2 review note).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-2/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const SIGNED_PROJECT = '66a6b38e-2128-4a39-b598-01af0a54ea04'; // Whitfield — full lineage
const MANUAL_PROJECT = '05364074-614a-443c-90fb-173f4b259f58'; // Olsen — ghost sections
const SENT_PROPOSAL = 'b0000000-0000-0000-0000-000000000002'; // pre-signing chain

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });

// Sign in as the seeded designer (email mode defaults to password input;
// give the first-compile dev server time before assuming the mode is wrong)
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

// ── The Desk: folders now link to documents ──
await page.goto('http://localhost:3000/desk');
await page.waitForSelector('a[href^="/doc/"]', { timeout: 30_000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}desk-with-links.png`, fullPage: true });

// ── Signed project document (Whitfield): full-bleed, settled bars, FF&E ──
await page.goto(`http://localhost:3000/doc/${SIGNED_PROJECT}`);
await page.waitForSelector('[data-active-section]', { timeout: 30_000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}doc-signed-project-desktop.png`, fullPage: true });

// Proposal settled bar unfolds in place — canonical blocks + seal
await page.click('button:has-text("Proposal · v1")');
await page.waitForSelector('text=Payment schedule', { timeout: 15_000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}doc-proposal-unfold.png`, fullPage: true });

// Esc priority: ledger sheet first, then put down
await page.click('nav[aria-label="Studio drawer"] >> text=Orders');
await page.waitForSelector('[role="dialog"]');
await page.keyboard.press('Escape'); // closes the sheet
await page.waitForTimeout(300);
if (await page.locator('[role="dialog"]').count()) throw new Error('sheet did not close on Esc');
if (!page.url().includes('/doc/')) throw new Error('Esc with sheet open must NOT put down');
await page.keyboard.press('Escape'); // puts down
await page.waitForURL('**/desk', { timeout: 10_000 });
console.log('✓ Esc priority: sheet first, then put down');

// ── Manual project (Olsen): Brief→Proposal ghost ──
await page.goto(`http://localhost:3000/doc/${MANUAL_PROJECT}`);
await page.waitForSelector('[data-active-section]', { timeout: 30_000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}doc-manual-project-ghost.png`, fullPage: true });

// ── Pre-signing proposal document: Proposal section active ──
await page.goto(`http://localhost:3000/doc/${SENT_PROPOSAL}`);
await page.waitForSelector('[data-active-section]', { timeout: 30_000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}doc-proposal-shape-desktop.png`, fullPage: true });

// ── Mobile (D12 interim): spine = sticky horizontal strip ──
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`http://localhost:3000/doc/${SIGNED_PROJECT}`);
await page.waitForSelector('[data-active-section]', { timeout: 30_000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}doc-mobile.png`, fullPage: true });

await browser.close();
console.log(`Saved 6 screenshots to ${OUT}`);
