/**
 * Slice 5.5 review screenshots + scripted acceptance (spec v1.3 §13, R18):
 *   - a drafted PO sends from BOTH homes through the same preview-confirm
 *   - need lines rise and clear truthfully at the provisional thresholds
 *   - the document updates in one act when a send completes
 *   - zero badges, banners, or dialogs introduced (the preview IS the confirm)
 * One-off helper.
 *
 *   node scripts/the-document-slice5.5-shots.mjs
 *
 * Requires: worktree dev server on :3100, migrations through 00200,
 * `the-document-local-seed.sql` run, po-send edge runtime up.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-5.5/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3100';
const WHITFIELD_PROPOSAL = 'b0000000-0000-0000-0000-000000000001';

const psql = (sql) =>
  execSync('docker exec -i supabase_db_supabase psql -U postgres -d postgres -At', { input: sql })
    .toString()
    .trim();

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

const PREVIEW = '[role="dialog"][aria-label="Purchase order preview"]';

// ── Desk: both R18 need lines risen at the provisional thresholds ──
await page.goto(`${BASE}/desk`);
await page.waitForSelector('text=/drafted — not yet sent/', { timeout: 60_000 });
await page.waitForSelector('text=/sent — no acknowledgment/', { timeout: 20_000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}desk-send-needs.png`, fullPage: true });
console.log('✓ need lines risen: drafted-unsent (2d) and sent-unacknowledged (3d)');

// ── Home 1 · the unfold: lifecycle narration + Send through the preview ──
await page.goto(`${BASE}/doc/${WHITFIELD_PROPOSAL}`);
await page.waitForURL((u) => !u.pathname.includes(WHITFIELD_PROPOSAL), { timeout: 60_000 });
await page.waitForSelector('[data-active-section]', { timeout: 60_000 });
await page.click('main >> text=White Oak Console');
await page.waitForSelector('main >> text=/not yet sent/', { timeout: 15_000 });
await page.click('main >> text=/^Send to vendor$/');
await page.waitForSelector(`${PREVIEW} >> text=/This is what/`, { timeout: 15_000 });
await page.waitForSelector(`${PREVIEW} >> iframe[title="Purchase order PDF"]`, {
  timeout: 45_000,
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}doc-po-preview-confirm.png`, fullPage: false });
await page.click(`${PREVIEW} >> button:has-text("Send to vendor")`);
await page.waitForSelector(PREVIEW, { state: 'detached', timeout: 45_000 });
// One act, many surfaces: the unfold's PO cell flips without remount.
await page.waitForSelector('main >> text=/sent to vendor/', { timeout: 20_000 });
const sent = psql(
  `select count(*) from purchase_orders po join project_ffe_items i on i.purchase_order_id = po.id
   where i.name = 'White Oak Console' and po.sent_at is not null and po.po_number is not null;`,
);
if (sent !== '1') throw new Error('unfold send did not stamp sent_at/po_number');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}doc-po-sent.png`, fullPage: false });
console.log('✓ home 1 (unfold): preview-as-confirm sent the PO; the PO cell flipped in one act');

// ── Home 2 · Orders ledger: send the Chen draft through the SAME preview ──
await page.click('nav[aria-label="Studio drawer"] >> text=Orders');
await page.waitForSelector('text=/the studio ledger/', { timeout: 15_000 });
const chenRow = page.locator('[role="dialog"] li', { hasText: 'CH-104' });
await chenRow.locator('text=/^send →$/').click();
await page.waitForSelector(`${PREVIEW} >> text=/This is what/`, { timeout: 15_000 });
await page.waitForSelector(`${PREVIEW} >> iframe[title="Purchase order PDF"]`, {
  timeout: 45_000,
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}orders-row-send.png`, fullPage: false });
await page.click(`${PREVIEW} >> button:has-text("Send to vendor")`);
await page.waitForSelector(PREVIEW, { state: 'detached', timeout: 45_000 });
await page.keyboard.press('Escape'); // put the ledger down
console.log('✓ home 2 (Orders ledger): the same preview-confirm sent CH-104');

// ── Need lines CLEAR truthfully ──
await page.goto(`${BASE}/desk`);
await page.waitForSelector('a[href^="/doc/"]', { timeout: 60_000 });
await page.waitForTimeout(1000);
if (await page.locator('text=/drafted — not yet sent/').count())
  throw new Error('drafted-unsent need did not clear after both sends');
await page.screenshot({ path: `${OUT}desk-needs-cleared.png`, fullPage: true });
console.log('✓ both drafted-unsent need lines cleared truthfully');

// ── The Money margin item (00189 payment-due → margin) ──
await page.goto(`${BASE}/doc/${WHITFIELD_PROPOSAL}`);
await page.waitForSelector('[data-active-section]', { timeout: 60_000 });
await page.click('aside[aria-label="Margin"] >> text=/vendor payment due/i');
await page.waitForSelector('aside[aria-label="Margin"] >> text=/Settle it from the Orders book/', {
  timeout: 15_000,
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}doc-money-vendor-payment.png`, fullPage: false });
console.log('✓ payment-due flip surfaced as a read-only Money margin item');

// ── Mobile ──
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/desk`);
await page.waitForSelector('a[href^="/doc/"]', { timeout: 60_000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}desk-mobile.png`, fullPage: true });

await browser.close();
console.log(`Saved screenshots to ${OUT}`);
