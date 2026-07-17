import { test, expect, Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Back of House · Fulfillment Queue smoke (S1, spec §5.1)
//
// Chromium-only (repo e2e trap: run with --project=chromium). Drives the
// keyboard-first Queue against the seeded local stack — S0's 5 orders
// (`pnpm seed:fulfillment`) plus S1's 3 band-coverage fixtures
// (`psql ... -f scripts/seed-fulfillment-fixtures.sql`). Requires
// NEXT_PUBLIC_ENABLE_FULFILLMENT=true in apps/admin-portal/.env.local so the
// zone is nav-reachable (the routes themselves are always URL-routable).
// ─────────────────────────────────────────────────────────────────────────────

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

test.describe('Back of House — Fulfillment Queue', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test('renders every row the API returns, across all three bands', async ({ page }) => {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/admin/fulfillment/queue') && r.status() === 200),
      page.goto('/fulfillment'),
    ]);
    const body = await response.json();
    const total: number = body.data.total;
    expect(total).toBeGreaterThan(0);

    await expect(page.getByTestId('queue-bands')).toBeVisible({ timeout: 15000 });

    const rows = page.getByTestId('queue-row');
    await expect(rows.first()).toBeVisible();
    await expect(rows).toHaveCount(total);

    // The header's own count and the sum of the three band counts must agree
    // with the rendered row count — the zero-invisibility invariant, on screen.
    await expect(page.getByTestId('queue-total')).toContainText(String(total));

    const nanCount = Number(await page.getByTestId('queue-band-count-needs_action_now').textContent());
    const watchingCount = Number(await page.getByTestId('queue-band-count-watching').textContent());
    const quietCount = Number(await page.getByTestId('queue-band-count-quiet').textContent());
    expect(nanCount + watchingCount + quietCount).toBe(total);

    // All three bands populated (S1 fixtures guarantee this).
    expect(nanCount).toBeGreaterThan(0);
    expect(watchingCount).toBeGreaterThan(0);
    expect(quietCount).toBeGreaterThan(0);
  });

  test('band placement: stale fixture is Needs Action Now with terracotta age; in-transit fixture is Watching; unmapped orders are Needs Action Now', async ({
    page,
  }) => {
    await page.goto('/fulfillment');
    await expect(page.getByTestId('queue-bands')).toBeVisible({ timeout: 15000 });

    // Stale fixture — terracotta (breached) age, in the Needs Action Now band.
    const staleRow = page.locator('[data-testid="queue-row"][data-band="needs_action_now"]', {
      hasText: 'Talia Bloom',
    });
    await expect(staleRow).toBeVisible();
    await expect(staleRow.getByTestId('queue-row-age')).toHaveAttribute('data-breached', 'true');

    // In-transit fixture — Watching band, next-action verb reads "In transit".
    const inTransitRow = page.locator('[data-testid="queue-row"][data-band="watching"]', {
      hasText: 'Dorian Ashford',
    });
    await expect(inTransitRow).toBeVisible();
    await expect(inTransitRow.getByTestId('queue-row-verb')).toHaveText('In transit');

    // Delivered fixture — Quiet band (screenshot's third band).
    const deliveredRow = page.locator('[data-testid="queue-row"][data-band="quiet"]', {
      hasText: 'Wren Castellano',
    });
    await expect(deliveredRow).toBeVisible();

    // The two S0-seeded unmapped-item orders (Odalys Ferreira / Grant Okafor)
    // are Needs Action Now via has_unmapped.
    const unmappedRows = page.locator('[data-testid="queue-row"][data-band="needs_action_now"]', {
      hasText: /Odalys Ferreira|Grant Okafor/,
    });
    await expect(unmappedRows).toHaveCount(2);
  });

  test('full keyboard traversal without the mouse: j/k across all bands, Enter navigates, n opens the drawer, Escape closes, x opens the exception drawer', async ({
    page,
  }) => {
    await page.goto('/fulfillment');
    await expect(page.getByTestId('queue-bands')).toBeVisible({ timeout: 15000 });

    const rows = page.getByTestId('queue-row');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(3);

    // Default selection is the first row (index 0).
    await expect(rows.nth(0)).toHaveAttribute('data-selected', 'true');

    // j through every row — selection should reach the LAST row and never
    // wrap/crash, walking across band boundaries (the queue is one flat list
    // for keyboard purposes even though it's rendered in three sections).
    for (let i = 0; i < rowCount - 1; i++) {
      await page.keyboard.press('j');
    }
    await expect(rows.nth(rowCount - 1)).toHaveAttribute('data-selected', 'true');

    // Pressing j again at the end does not move past the last row.
    await page.keyboard.press('j');
    await expect(rows.nth(rowCount - 1)).toHaveAttribute('data-selected', 'true');

    // k walks back up.
    await page.keyboard.press('k');
    await expect(rows.nth(rowCount - 2)).toHaveAttribute('data-selected', 'true');

    // Back to the first row for the rest of the test.
    for (let i = 0; i < rowCount; i++) {
      await page.keyboard.press('k');
    }
    await expect(rows.nth(0)).toHaveAttribute('data-selected', 'true');

    // n opens the note drawer for the selected row. S4 shipped the real
    // draft/send flow (this spec's S1 version asserted the disabled stub
    // it replaced — updated here to the shipped surface, same coverage
    // intent): opening drafts (or reuses) a real client note against the
    // live stack, renders it in an editable textarea, and enables Send
    // once the draft has loaded, unedited.
    await page.keyboard.press('n');
    const drawer = page.getByTestId('note-drawer');
    await expect(drawer).toBeVisible();
    const noteBody = drawer.getByTestId('note-drawer-body');
    await expect(noteBody).toBeVisible({ timeout: 15000 });
    await expect(noteBody).not.toHaveValue('');
    const sendButton = drawer.getByTestId('note-drawer-send');
    await expect(sendButton).toBeEnabled();
    await expect(sendButton).toHaveText('Send');

    // While the drawer is open, j/k are suspended (drawer owns the keyboard).
    await page.keyboard.press('j');
    await expect(rows.nth(0)).toHaveAttribute('data-selected', 'true');

    // Escape closes the drawer (Radix Dialog default behavior).
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();

    // j works again once the drawer is closed.
    await page.keyboard.press('j');
    await expect(rows.nth(1)).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('k');
    await expect(rows.nth(0)).toHaveAttribute('data-selected', 'true');

    // x opens the real open-exception drawer (S7 replaced the stub toast).
    // Escape closes it and restores keyboard control.
    await page.keyboard.press('x');
    await expect(page.getByTestId('open-exception-drawer')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('open-exception-drawer')).not.toBeVisible();

    // Enter navigates to the Order Workbench (S2, now the real screen) for the
    // selected row's order id.
    const selectedOrderId = await rows.nth(0).getAttribute('data-order-id');
    expect(selectedOrderId).toBeTruthy();
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => u.pathname === `/fulfillment/orders/${selectedOrderId}`, {
      timeout: 10000,
    });
    await expect(page.getByTestId('workbench-root')).toBeVisible({ timeout: 15000 });
  });
});
