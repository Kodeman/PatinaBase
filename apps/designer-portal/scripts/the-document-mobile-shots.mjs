/**
 * Slice 6 increment 3 — the D13 mobile pattern acceptance (390px viewport).
 *   D3-1 unified bar: Desk shows drawer + in-hand-today; a document shows the
 *        section handle + timer glance + drawer book.
 *   D3-2 anchored chips: margin items render as chips beneath their line /
 *        letterhead; tapping one raises the item as a paper sheet.
 *   D3-3 the spine sheet doubles: sections on top, "In the margin · N" beneath.
 *   Drawer book opens a charcoal ledger sheet (open-ledger).
 *   Desktop rails (spine, margin aside, studio nav) are hidden at this width.
 *
 *   node scripts/the-document-mobile-shots.mjs
 *
 * Requires: worktree dev server on :3100, migrations + seed applied.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const psql = (sql) =>
  execSync('docker exec -i supabase_db_supabase psql -U postgres -d postgres -At', { input: sql })
    .toString()
    .trim();

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-6/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3100';
const WHITFIELD_PROPOSAL = 'b0000000-0000-0000-0000-000000000001';

// Reset this week's Whitfield pulse to draft so its margin item is actionable.
const wproj = psql(`select project_id from proposals where id='b0000000-0000-0000-0000-000000000001';`);
psql(`update weekly_pulses set status='draft', sent_at=null, sent_message_id=null
      where project_id='${wproj}' and week_of = date_trunc('week', now())::date;`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });

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

const visible = (sel) => page.locator(sel).first().isVisible();

// ── Desk: the bar shows drawer + in-hand-today; the studio nav is hidden ──
await page.goto(`${BASE}/desk`);
await page.waitForSelector('a[href^="/doc/"]', { timeout: 60_000 });
await page.waitForSelector('nav[aria-label="Document bar"]', { timeout: 15_000 });
if (await visible('nav[aria-label="Studio drawer"]'))
  throw new Error('desktop Studio nav must be hidden at 390px');
await page.waitForSelector('nav[aria-label="Document bar"] >> text=/Five books/', { timeout: 10_000 });
await page.waitForSelector('nav[aria-label="Document bar"] >> text=/In hand today/', { timeout: 10_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}mobile-desk-bar.png` });
console.log('✓ D3-1 desk bar: drawer handle + in-hand-today; desktop studio nav hidden');

// ── Document: desktop spine + margin rails hidden; bar shows section/timer/book ──
await page.goto(`${BASE}/doc/${WHITFIELD_PROPOSAL}`);
await page.waitForURL((u) => !u.pathname.includes(WHITFIELD_PROPOSAL), { timeout: 60_000 });
await page.waitForSelector('[data-active-section]', { timeout: 60_000 });
if (await visible('aside[aria-label="Document spine"]'))
  throw new Error('desktop spine must be hidden at 390px');
if (await visible('aside[aria-label="Margin"]'))
  throw new Error('desktop margin rail must be hidden at 390px');
await page.waitForSelector('nav[aria-label="Document bar"] >> text=/Section/', { timeout: 10_000 });
await page.waitForSelector('nav[aria-label="Document bar"] [aria-label="Open the timer"]', {
  timeout: 10_000,
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}mobile-document.png` });
console.log('✓ D3-1 doc bar: section handle + timer glance + drawer book; desktop rails hidden');

// ── D3-2 anchored chips → margin item sheet ──
// The letterhead carries the Pulse (letterhead/section anchor).
const pulseChip = page.locator('main button', { hasText: /Weekly Pulse|Friday Pulse/ }).first();
await pulseChip.waitFor({ timeout: 15_000 });
await page.screenshot({ path: `${OUT}mobile-chips.png` });
await pulseChip.click();
await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 15_000 });
await page.waitForSelector('[role="dialog"] >> text=/Friday Pulse/', { timeout: 10_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}mobile-margin-item-sheet.png` });
console.log('✓ D3-2 anchored chip raised the margin item as a paper sheet');
await page.locator('[role="dialog"] [aria-label="Dismiss"]').click();

// ── D3-3 the spine sheet doubles: sections + "In the margin · N" ──
await page.click('nav[aria-label="Document bar"] [aria-label="Open the spine"]');
await page.waitForSelector('[role="dialog"] >> text=/Put down/', { timeout: 10_000 });
await page.waitForSelector('[role="dialog"] >> text=/In the margin ·/', { timeout: 10_000 });
// a section row and at least one margin summary row present
await page.waitForSelector('[role="dialog"] >> text=Project', { timeout: 10_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}mobile-spine-sheet.png` });
console.log('✓ D3-3 spine sheet doubles: sections + "In the margin · N"');
// jump from the spine's margin summary into an item
await page.locator('[role="dialog"] button', { hasText: /Decision|Money|Message|Pulse/ }).first().click();
await page.waitForSelector('[role="dialog"] [aria-label="Dismiss"]', { timeout: 10_000 });
console.log('✓ spine summary row jumps to the margin item');
await page.locator('[role="dialog"] [aria-label="Dismiss"]').click();

// ── Drawer book → charcoal ledger sheet ──
await page.click('nav[aria-label="Document bar"] [aria-label="Open the drawer"]');
await page.waitForSelector('[role="dialog"] >> text=/five books/', { timeout: 10_000 });
await page.click('[role="dialog"] >> text=/^Hours$/');
await page.waitForSelector('text=/Export week/', { timeout: 15_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}mobile-ledger.png` });
console.log('✓ drawer book opened the Hours ledger as a charcoal sheet');

await browser.close();
console.log(`Saved screenshots to ${OUT}`);
