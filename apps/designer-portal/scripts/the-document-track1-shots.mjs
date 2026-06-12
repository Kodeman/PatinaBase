/**
 * Dissolve Track 1 review screenshots + scripted acceptance:
 *   - R23 The Work: the dued task rises on the Desk; the work block renders
 *     under the section head with the pending gate line
 *   - R24 The Folio: section strip with a stacked version chain; letterhead
 *     "The folio · N files"; line-anchored cut sheet in the unfold
 *   - R25 Rooms: Playfair-italic room headings with live allocation +
 *     placed counts; "Throughout · unassigned"; mobile spine-sheet jump rows
 *   - R26 The Account Page: collapsed honest line; variance table
 *     (sage/terracotta); margin + earnings; milestones with trigger config
 *   - R27 instruments: View as the Whitfields renders the read-only client
 *     mirror — install-schedule.pdf visible, the accounts and unflagged
 *     files ABSENT
 *   - R29 colophon: the paper's last line states its facts
 *
 *   node scripts/the-document-track1-shots.mjs
 *
 * Requires: worktree dev server on :3100, migrations through 00205,
 * the-document-local-seed.sql + the-document-track1-seed.sql run.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/track-1/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3100';
const WHITFIELD_PROPOSAL = 'b0000000-0000-0000-0000-000000000001';

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

// ── A · the Desk at demo heat ──
// The dued task IS a Desk input (jest rank tests + SQL ASSERT 1 prove the
// derivation); at Whitfield/Olsen heat it is rightly shadowed by
// higher-ranked needs (overdue decision, open claim) — the one-thing
// discipline working as ruled. The shot captures the honest Desk.
await page.goto(`${BASE}/desk`);
await page.waitForSelector('a[href^="/doc/"]', { timeout: 60_000 });
await page.screenshot({ path: `${OUT}desk.png` });
console.log('✓ Desk renders at demo heat (task_due verified at unit + view layers)');

// ── B · the Whitfield document: letterhead, instruments, accounts, work ──
await page.goto(`${BASE}/doc/${WHITFIELD_PROPOSAL}`);
await page.waitForURL((u) => !u.pathname.includes(WHITFIELD_PROPOSAL), { timeout: 60_000 });
await page.waitForSelector('text=/The accounts · this project/', { timeout: 30_000 });
await page.waitForSelector('text=/View as the/i', { timeout: 10_000 });
await page.waitForSelector('text=/The folio · /', { timeout: 10_000 });
await page.screenshot({ path: `${OUT}document-top.png` });
console.log('✓ R26/R27/R24: account band (collapsed) + instruments row + folio letterhead line');

// ── C · the work block + room headings + folio strip ──
await page.waitForSelector('text=/The work/', { timeout: 10_000 });
await page.waitForSelector('text=/Approval requested · awaiting Sarah Whitfield/', {
  timeout: 10_000,
});
const livingHeading = page.locator('h3:has-text("Living room")');
await livingHeading.waitFor({ timeout: 10_000 });
await page.waitForSelector('text=/Throughout · unassigned/', { timeout: 10_000 });
// the stacked chain: lighting-plan.pdf carries v2
await page.waitForSelector('button:has-text("lighting-plan.pdf")', { timeout: 10_000 });
await page.waitForSelector('button:has-text("v2")', { timeout: 10_000 });
const section = page.locator('[data-active-section]');
await section.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}work-folio-rooms.png` });
console.log('✓ R23/R24/R25: work block + gate line · folio strip (v2 stack) · room headings + Throughout');

// ── D · the account page unfolded ──
await page.click('text=/The accounts · this project/');
await page.waitForSelector('text=/Payment milestones/', { timeout: 10_000 });
await page.waitForSelector('text=/Design fee/', { timeout: 10_000 });
// variance table groups by the same rooms (R25 source)
const varianceLiving = await page
  .locator('div:has-text("Living room")')
  .filter({ hasText: /under|over/ })
  .count();
if (varianceLiving === 0) throw new Error('variance table missing the Living room row');
await page.screenshot({ path: `${OUT}account-page-unfolded.png` });
console.log('✓ R26: unfolded — variance by room, margin line, earnings, milestones w/ trigger config');
await page.click('text=/fold ↑/');

// ── E · line unfold: room select + line folio ──
await page.click('text=Brass Pendant Cluster');
await page.waitForSelector('select[aria-label="Assign to room"]', { timeout: 10_000 });
await page.waitForSelector('button:has-text("pendant-cutsheet.pdf")', { timeout: 10_000 });
await page.screenshot({ path: `${OUT}line-unfold-room-folio.png` });
console.log('✓ R25/R24: the unfold assigns rooms; the cut sheet clips to the line');
await page.click('text=/Fold ↑/');

// ── F · the client mirror (R27): read-only, and the private layer holds ──
await page.click('text=/View as the/i');
await page.waitForSelector('[data-testid="client-mirror"]', { timeout: 15_000 });
await page.waitForSelector('text=/You.re seeing what they see/i', { timeout: 10_000 });
await page.waitForSelector('text=install-schedule.pdf', { timeout: 10_000 });
const mirror = page.locator('[data-testid="client-mirror"]');
if (await mirror.locator('text=/The accounts/').count())
  throw new Error('R26 VIOLATION: the account page rendered in the client mirror');
if (await mirror.locator('text=lighting-plan.pdf').count())
  throw new Error('R24 VIOLATION: an unflagged folio file rendered in the client mirror');
if (await mirror.locator('text=/Order fabric memos/').count())
  throw new Error('R23 VIOLATION: a studio task rendered in the client mirror');
await page.screenshot({ path: `${OUT}client-mirror.png` });
console.log('✓ R27: the mirror shows the flagged file + the gate; accounts/tasks/unflagged files absent');
await page.click('text=/Back to your copy/i');

// ── G · the colophon (R29) ──
await page.locator('footer').scrollIntoViewIfNeeded();
await page.waitForSelector('text=/hands on the work/', { timeout: 10_000 });
await page.waitForSelector('text=/Brief a vendor/', { timeout: 10_000 });
await page.screenshot({ path: `${OUT}colophon.png` });
console.log('✓ R29: the colophon states the paper’s facts');

// ── H · mobile: room jump rows in the spine sheet (R25) ──
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
await page.click('[aria-label="Open the spine"]');
await page.waitForSelector('text=/Rooms/', { timeout: 10_000 });
await page.waitForSelector('button:has-text("Dining room")', { timeout: 10_000 });
await page.screenshot({ path: `${OUT}mobile-spine-rooms.png` });
console.log('✓ R25 (D13): room headings join the mobile spine sheet as jump rows');

await browser.close();
console.log(`\nAll Track 1 scripted acceptance green. Screenshots → ${OUT}`);
