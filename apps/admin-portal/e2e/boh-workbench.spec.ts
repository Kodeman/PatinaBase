import { test, expect, type Page, type Locator } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Back of House · Order Workbench (S2, spec §5.2) — the S2 accepts-when as tests.
//
// Chromium-only (repo e2e trap: run with --project=chromium). SERIAL + single
// worker: the tests share the seeded 5-vendor order (order_no 1, Priya Anand),
// and Test 1 confirms it — so Test 2 depends on that confirmed state. Declared
// in execution order; do not parallelize.
//
// dnd-kit + Playwright drag: native `dragTo` does NOT fire dnd-kit's
// PointerSensor (repo history — boards QA). The dragLine() helper below drives
// synthetic pointer motion via page.mouse (down → stepped move past the 8px
// activation constraint → move to target → up), the reliable pattern for
// dnd-kit's PointerSensor.
//
// Requires the seeded local stack: `supabase db reset` → functions serve →
// `pnpm seed:fulfillment` → `psql -f scripts/seed-fulfillment-fixtures.sql`,
// and NEXT_PUBLIC_ENABLE_FULFILLMENT=true in apps/admin-portal/.env.local.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

const ADMIN_EMAIL = 'admin@patina.dev';
const ADMIN_PASSWORD = 'password123';

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

/** Open the Workbench for the queue row naming `clientName`. */
async function openOrder(page: Page, clientName: string) {
  await page.goto('/fulfillment');
  await expect(page.getByTestId('queue-bands')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-testid="queue-row"]', { hasText: clientName }).first().click();
  await page.waitForURL((u) => /\/fulfillment\/orders\//.test(u.pathname), { timeout: 15000 });
  await expect(page.getByTestId('workbench-root')).toBeVisible({ timeout: 15000 });
}

/** Drive a dnd-kit drag from source to target via synthetic pointer motion. */
async function dragLine(page: Page, source: Locator, target: Locator) {
  const s = await source.boundingBox();
  const t = await target.boundingBox();
  if (!s || !t) throw new Error('dragLine: missing bounding box');
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  // cross the 8px PointerSensor activation constraint first
  await page.mouse.move(s.x + s.width / 2 + 12, s.y + s.height / 2 + 12, { steps: 5 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 12 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 3 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await signInAsAdmin(page);
});

test('5-vendor order decomposes to 5 PO drafts on confirm; every ① threads both sides; strip warns below floor', async ({
  page,
}) => {
  await openOrder(page, 'Priya Anand');

  // Proposed split — 5 cards, one per vendor.
  const cards = page.getByTestId('wb-po-card');
  await expect(cards).toHaveCount(5);

  // Threading: each line index ①…⑤ appears on BOTH sides.
  for (let i = 1; i <= 5; i++) {
    await expect(
      page.locator(`[data-testid="wb-line"][data-line-index="${i}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-testid="wb-po-line"][data-line-index="${i}"]`),
    ).toBeVisible();
  }

  // Strip warns terracotta: the seeded order's ~20% blended margin < 25% floor.
  await expect(page.getByTestId('money-strip')).toHaveAttribute('data-below-floor', 'true');

  // Confirm → 5 real POs, numbered A…E.
  const confirmBtn = page.getByTestId('wb-confirm-button');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
  await expect(page.getByTestId('wb-confirm-bar')).toHaveAttribute('data-confirmed', 'true', {
    timeout: 15000,
  });
  await expect(page.getByTestId('wb-po-card')).toHaveCount(5);
  for (const letter of ['A', 'B', 'C', 'D', 'E']) {
    await expect(page.getByText(new RegExp(`PO-\\d{4}-\\d{5}-${letter}`)).first()).toBeVisible();
  }
});

test('an unmapped line blocks confirm and unblocks on vendor + cost assignment; the strip re-figures', async ({
  page,
}) => {
  await openOrder(page, 'Odalys Ferreira'); // order 3 — 1 mapped + 1 unmapped line

  // Blocked: confirm disabled with a visible reason.
  await expect(page.getByTestId('wb-confirm-button')).toBeDisabled();
  await expect(page.getByTestId('wb-confirm-reason')).toContainText(/unmapped/i);
  await expect(page.getByTestId('wb-unmapped-chip').first()).toBeVisible();

  const vendorCostBefore = await page
    .getByTestId('money-vendor-cost')
    .locator('[data-value]')
    .getAttribute('data-value');

  // Assign the unmapped line a vendor + cost via the popover.
  await page
    .locator('[data-testid="wb-line"][data-mapping="unmapped"]')
    .first()
    .getByTestId('wb-line-assign')
    .click();
  await expect(page.getByTestId('wb-assign-popover')).toBeVisible();
  await page.getByTestId('wb-assign-vendor').selectOption({ index: 1 });
  await page.getByTestId('wb-assign-cost').fill('300.00');

  // Wait for the PERSISTED assign (POST), not just the optimistic cache flash —
  // otherwise the assertion races the navigation that aborts the request.
  const [assignResp] = await Promise.all([
    page.waitForResponse(
      (r) => /\/fulfillment\/lines\/.+\/assign/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 15000 },
    ),
    page.getByTestId('wb-assign-submit').click(),
  ]);
  expect(assignResp.status()).toBe(200);

  // Unblocked, and the money strip re-figured (vendor cost rose by the new cost).
  await expect(page.getByTestId('wb-assign-popover')).toBeHidden();
  await expect(page.getByTestId('wb-confirm-button')).toBeEnabled({ timeout: 15000 });
  const vendorCostAfter = await page
    .getByTestId('money-vendor-cost')
    .locator('[data-value]')
    .getAttribute('data-value');
  expect(vendorCostAfter).not.toBe(vendorCostBefore);
});

test('post-confirm: dragging a PO line into another PO moves it (move_line)', async ({ page }) => {
  await openOrder(page, 'Priya Anand'); // confirmed by the first test
  await expect(page.getByTestId('wb-confirm-bar')).toHaveAttribute('data-confirmed', 'true');

  // The card holding line ② (PO-B) is the move destination for line ①.
  // The card holding a line OTHER than ① is the move destination for ①.
  const anchorIndex = await page
    .locator('[data-testid="wb-po-card"]:not(:has([data-testid="wb-po-line"][data-line-index="1"])) [data-testid="wb-po-line"]')
    .first()
    .getAttribute('data-line-index');
  const targetCard = page
    .getByTestId('wb-po-card')
    .filter({ has: page.locator(`[data-testid="wb-po-line"][data-line-index="${anchorIndex}"]`) });
  const sourceLine = page.locator('[data-testid="wb-po-line"][data-line-index="1"]');

  // Assert the PERSISTED move: wait for the move-line POST, not just the
  // optimistic cache flash (a missed drop must fail this test, not pass on the
  // optimistic state).
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/fulfillment/orders/') && r.url().includes('/move-line') && r.request().method() === 'POST',
      { timeout: 15000 },
    ),
    dragLine(page, sourceLine, targetCard),
  ]);
  expect(resp.status()).toBe(200);

  // After the move, the card that held the anchor line also holds ①.
  await expect(
    page
      .getByTestId('wb-po-card')
      .filter({ has: page.locator(`[data-testid="wb-po-line"][data-line-index="${anchorIndex}"]`) })
      .locator('[data-testid="wb-po-line"][data-line-index="1"]'),
  ).toBeVisible({ timeout: 15000 });
});
