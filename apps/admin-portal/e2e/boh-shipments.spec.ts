import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Back of House · Shipment Board (S5, spec §5.4) — package S5 accepts-when as a
// UI test: parcel+LTL mode chips render; an LTL shipment cannot reach
// "delivered" without a confirmed appointment (negative — both the UI
// affordance AND the API's 409 are asserted, since fulfillment_record_delivery
// (00353) does not itself gate this — see api/admin/fulfillment/shipments/
// route headers, BOH-DECISIONS I10); a slipped current ETA renders with a
// terracotta delta; a live POD upload opens the inspection countdown, which is
// the loudest element on the board; open-window rows pin to the top.
//
// --project=chromium --workers=1 (repo e2e trap — see patina-testing).
//
// Requires the seeded local stack: `supabase db reset` -> `functions serve`
// -> `pnpm seed:fulfillment` -> `psql -f scripts/seed-fulfillment-fixtures.sql`
// -> `psql -f scripts/seed-fulfillment-shipment-fixtures.sql`, and
// apps/admin-portal/.env.local pointing at LOCAL Supabase (127.0.0.1:54321)
// with the working service-role key. SERIAL: the POD-upload test changes
// fixture (a)'s state, and the final "pinned first" assertion depends on that
// mutation having already landed.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

const ADMIN_EMAIL = 'admin@patina.dev';
const ADMIN_PASSWORD = 'password123';

// scripts/seed-fulfillment-shipment-fixtures.sql client names:
const PARCEL_CLIENT = 'Soren Delacroix'; // (a) parcel in transit
const LTL_AWAITING_CLIENT = 'Imogen Farrow'; // (b) LTL awaiting appointment — Deliver blocked
const LTL_POD_CLIENT = 'Baxter Linden'; // (c) LTL, POD recorded, window ~2 days out
const SLIPPED_CLIENT = 'Odette Marchetti'; // (d) slipped current ETA, +7d vs promised

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

function rowFor(page: Page, clientName: string) {
  return page.locator('[data-testid="shipment-row"]', { hasText: clientName }).first();
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await signInAsAdmin(page);
  await page.goto('/fulfillment/shipments');
  await expect(page.getByTestId('shipment-board')).toBeVisible({ timeout: 15000 });
});

test('parcel and LTL mode chips render with the correct mode', async ({ page }) => {
  const parcelChip = rowFor(page, PARCEL_CLIENT).getByTestId('mode-chip');
  await expect(parcelChip).toHaveAttribute('data-mode', 'parcel');
  await expect(parcelChip).toHaveText(/Parcel/i);

  const ltlChip = rowFor(page, LTL_AWAITING_CLIENT).getByTestId('mode-chip');
  await expect(ltlChip).toHaveAttribute('data-mode', 'ltl');
  await expect(ltlChip).toHaveText(/LTL/i);
});

test('an LTL shipment cannot reach delivered without a confirmed appointment — UI affordance AND API error', async ({
  page,
}) => {
  const row = rowFor(page, LTL_AWAITING_CLIENT);
  await expect(row).toBeVisible();

  // UI: Deliver and Upload POD are disabled with a visible reason.
  await expect(row.getByTestId('shipment-deliver-button')).toBeDisabled();
  await expect(row.getByTestId('shipment-upload-pod')).toBeDisabled();
  await expect(row.getByTestId('shipment-deliver-blocked-reason')).toContainText(
    /confirmed delivery appointment/i,
  );
  await expect(row.getByTestId('shipment-confirm-appointment')).toBeVisible();

  // API: a direct call to the deliver endpoint 409s with the same reason —
  // the application-layer gate every route shares (canDeliverShipment,
  // @patina/fulfillment), since the RPC itself does not enforce this (I10).
  // page.request (not the bare `request` fixture) shares the signed-in
  // session's cookies, so this hits the route as the authenticated admin.
  const shipmentId = await row.getAttribute('data-shipment-id');
  expect(shipmentId).toBeTruthy();
  const res = await page.request.post(`/api/admin/fulfillment/shipments/${shipmentId}/deliver`);
  expect(res.status()).toBe(409);
  const body = await res.json();
  expect(body.code).toBe('appointment_required');
});

test('a slipped current ETA renders with a terracotta delta', async ({ page }) => {
  const slip = rowFor(page, SLIPPED_CLIENT).getByTestId('shipment-slip-value');
  await expect(slip).toBeVisible();
  await expect(slip).toHaveAttribute('data-slipped', 'true');
  await expect(slip).toContainText('+7');
});

test('the pre-seeded open inspection window is loudest-on-board', async ({ page }) => {
  const row = rowFor(page, LTL_POD_CLIENT);
  await expect(row).toHaveAttribute('data-open-window', 'true');

  const clock = row.getByTestId('deadline-clock');
  await expect(clock).toBeVisible();
  await expect(clock).toHaveAttribute('data-terracotta', 'true');

  const value = row.getByTestId('deadline-clock-value');
  await expect(value).toHaveText(/\d+ DAYS?/);
  await expect(value).toHaveClass(/deadline-clock-loud/);

  // Loudest by contrast: its computed font-size is strictly larger than the
  // row's slip figure (the next-largest mono value on the board).
  const clockSize = await value.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const slipSize = await row
    .getByTestId('shipment-slip-value')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(clockSize).toBeGreaterThan(slipSize);
});

test('a live POD upload opens the inspection countdown on a parcel shipment', async ({ page }) => {
  const row = rowFor(page, PARCEL_CLIENT);
  await expect(row).toBeVisible();
  await expect(row.getByTestId('deadline-clock')).toHaveCount(0);

  const fileInput = row.getByTestId('shipment-pod-file-input');
  await fileInput.setInputFiles({
    name: 'pod.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('fake-pod-bytes'),
  });

  await expect(row.getByTestId('deadline-clock')).toBeVisible({ timeout: 15000 });
  await expect(row).toHaveAttribute('data-open-window', 'true', { timeout: 15000 });
  await expect(row).toHaveAttribute('data-delivered', 'true');
});

test('open-inspection-window rows are pinned above the rest of the board', async ({ page }) => {
  // After the previous test, TWO rows carry an open window: the pre-seeded
  // fixture (closing ~2 days out) and the just-delivered parcel fixture
  // (closing ~5 days out, the parcel default). Both must precede every
  // non-window row, soonest-closing first.
  await page.reload();
  await expect(page.getByTestId('shipment-board')).toBeVisible({ timeout: 15000 });

  const rows = page.getByTestId('shipment-row');
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(4);

  const openFlags = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-open-window')));
  const firstNonOpenIndex = openFlags.findIndex((v) => v !== 'true');
  const openCount = firstNonOpenIndex === -1 ? openFlags.length : firstNonOpenIndex;
  expect(openCount).toBeGreaterThanOrEqual(2);
  // No 'true' should appear after the first 'false' — open rows are a
  // contiguous prefix.
  expect(openFlags.slice(openCount)).not.toContain('true');

  // Soonest-closing first within the open prefix.
  const firstRowClient = await rows.nth(0).getByTestId('shipment-client-name').textContent();
  expect(firstRowClient).toContain(LTL_POD_CLIENT);
});

test('drop-2 screenshot — board with all four fixture states visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.getByTestId('shipment-board')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: '../../docs/design/back-of-house/drops/drop-2/01-shipment-board-four-states.png',
    fullPage: true,
  });
});
