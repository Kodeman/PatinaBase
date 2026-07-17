import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Back of House · PO Composer & Transmission Log (S3, spec §5.3) — the S3
// accepts-when as a UI test: preview renders, a transmit writes its log line,
// and ack capture flows.
//
// Chromium-only (repo e2e trap: run with --project=chromium). SERIAL, single
// worker: the test walks one order (order_no 2, Marcus Webb — a single email
// vendor, Room & Board) through confirm → compose → transmit → ack, so the
// steps depend on each other and must not parallelize.
//
// Requires the seeded local stack: `supabase db reset` → functions serve
// (EMAIL_DEV_MODE=dry_run) → `pnpm seed:fulfillment` →
// `psql -f scripts/seed-fulfillment-fixtures.sql`, and apps/admin-portal/
// .env.local pointing at the LOCAL Supabase (127.0.0.1:54321) with the working
// service-role key.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

const ADMIN_EMAIL = 'admin@patina.dev';
const ADMIN_PASSWORD = 'password123';
const ORDER_CLIENT = 'Marcus Webb';

async function signInAsAdmin(page: Page) {
  await page.goto('/auth/signin');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('button:has-text("Sign in with email")').first().click();
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/auth/signin'), { timeout: 20000 });
}

test('composer: confirm → preview renders → transmit writes a SENT line → ack writes an ACK line', async ({
  page,
}) => {
  // Next dev compiles each API route on its FIRST hit; the composer walks
  // several never-before-compiled routes (/pos, /preview, /transmit, /ack) in
  // one flow, so the first pass needs headroom beyond the 30s default.
  test.setTimeout(150_000);
  await signInAsAdmin(page);

  // Open the order's Workbench and confirm its split into a real PO.
  await page.goto('/fulfillment');
  await expect(page.getByTestId('queue-bands')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-testid="queue-row"]', { hasText: ORDER_CLIENT }).first().click();
  await page.waitForURL((u) => /\/fulfillment\/orders\//.test(u.pathname), { timeout: 15000 });
  await expect(page.getByTestId('workbench-root')).toBeVisible({ timeout: 15000 });

  const confirmBtn = page.getByTestId('wb-confirm-button');
  if (await confirmBtn.isVisible().catch(() => false)) {
    await expect(confirmBtn).toBeEnabled();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/confirm-split') && r.request().method() === 'POST' && r.ok(),
      ),
      confirmBtn.click(),
    ]);
    await expect(page.getByTestId('wb-confirm-bar')).toHaveAttribute('data-confirmed', 'true', {
      timeout: 15000,
    });
  }

  // Open the PO Composer from the (post-confirm) PO card.
  await page.getByTestId('wb-po-compose').first().click();
  await page.waitForURL((u) => /\/fulfillment\/pos\//.test(u.pathname), { timeout: 15000 });
  await expect(page.getByTestId('composer-root')).toBeVisible({ timeout: 15000 });

  // Preview renders as real paper.
  await expect(page.getByTestId('po-paper-object')).toBeVisible({ timeout: 20000 });

  // Transmit — this order's vendor is email; send it.
  const panel = page.getByTestId('transmit-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-transmission-type', 'email');
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/transmit') && r.request().method() === 'POST' && r.ok(),
    ),
    page.getByTestId('transmit-email-send').click(),
  ]);

  // A SENT line appears in the append-only log.
  await expect(page.locator('[data-testid="tx-log-line"][data-keyword="SENT"]').first()).toBeVisible({
    timeout: 20000,
  });

  // Ack capture is now available; record a committed ship date.
  await expect(page.getByTestId('ack-capture-form')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('ack-committed-ship').fill('2026-09-15');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/ack') && r.request().method() === 'POST' && r.ok()),
    page.getByTestId('ack-submit').click(),
  ]);

  // An ACK line appears in the log; the composer settles into its acknowledged
  // state (the ack form unmounts as the refetched PO flips to 'acknowledged').
  await expect(page.locator('[data-testid="tx-log-line"][data-keyword="ACK"]').first()).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByTestId('composer-acked')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('composer-acked')).toContainText('2026-09-15');
});
