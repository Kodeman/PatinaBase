import path from 'path';
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { getDesignerId, readProfile, setCreatedAt, setTourCompleted, clearHelpState } from '../helpers/help-state';

/**
 * Reactive help — the contextual panel (the `?` doorways / ⌘K "Help…") and the
 * re-homed Help Center (`/help`; `/portal/help` is now a permanent 308 from
 * next.config.js's R21 dissolve table — see dissolve-redirects.spec.ts for the
 * full table, this file keeps the one browser-level regression walk).
 *
 * The panel scopes to the surface it's opened from. On the Desk the only
 * surfaces carrying the `…/document/desk` help key are VERBS, which the panel's
 * intro logic deliberately excludes — so the Desk panel shows the F5 footer but
 * NO intro blurb (asserted below). Ledgers/rooms DO carry an intro blurb, so
 * the Orders sheet-head `?` frames the panel with the Orders registry blurb.
 */

test.describe.configure({ mode: 'serial' });

const SHOT_DIR = path.resolve(
  process.cwd(),
  '../../docs/design/the-document/screenshots/help-walkthrough',
);
const shot = (page: AuthenticatedPage, name: string, opts?: { fullPage?: boolean }) =>
  page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: opts?.fullPage ?? false });

/** The DESK HEADER's own "Find anything" act — scoped and exact, because the
 *  Studio Drawer prints a second door with the same visible words (C-AP-05). */
const findAnything = (page: AuthenticatedPage) =>
  page
    .locator('[role="group"][data-action-region="desk-head"]')
    .getByRole('button', { name: 'Find anything', exact: true });

async function gotoDesk(page: AuthenticatedPage): Promise<void> {
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });
  await expect(findAnything(page)).toBeVisible({
    timeout: 30_000,
  });
}

async function openPalette(page: AuthenticatedPage) {
  const palette = page.getByRole('dialog', { name: 'Command bar' });
  const affordance = findAnything(page);
  // The affordance dispatches document:open-command-bar → setOpen(true) (an
  // idempotent open, so retrying is safe). Retry until the palette appears —
  // the CommandBar's listener attaches on a client-effect that can lag the
  // desk becoming interactive on a cold dev compile.
  await expect(async () => {
    await affordance.click();
    await expect(palette).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  return palette;
}

test.describe('Reactive help — panel + Help Center', () => {
  let designerId: string;
  let originalCreatedAt: string;

  test.beforeAll(async () => {
    designerId = await getDesignerId();
    originalCreatedAt = (await readProfile(designerId)).created_at;
    // Neutralize the walkthrough so neither the auto-modal nor the offer note
    // interferes: existing designer (created_at < ship date) + completed record.
    await setCreatedAt(designerId, originalCreatedAt);
    await setTourCompleted(designerId);
  });

  test.afterAll(async () => {
    await setCreatedAt(designerId, originalCreatedAt);
    await clearHelpState(designerId);
  });

  test('desk — ⌘K "Help…" opens the contextual panel with the Browse-all-help footer', async ({
    authenticatedPage: page,
  }) => {
    await gotoDesk(page);

    const palette = await openPalette(page);
    await palette.getByRole('textbox').fill('help');
    await palette.getByText('Help…', { exact: true }).click();

    // The shared panel is open.
    await expect(page.getByTestId('help-panel-content')).toBeVisible({ timeout: 10_000 });
    // F5 — the "Browse all help" doorway to the Help Center.
    await expect(page.getByRole('link', { name: /Browse all help/i })).toBeVisible();
    // The Desk's help key is only carried by verbs, which the intro excludes —
    // so the Desk panel shows no intro blurb.
    await expect(page.getByTestId('help-panel-intro')).toHaveCount(0);
  });

  test('orders — the sheet-head ? scopes the panel to Orders with its blurb', async ({
    authenticatedPage: page,
  }) => {
    await gotoDesk(page);

    // Open the Orders ledger via ⌘K.
    const palette = await openPalette(page);
    await palette.getByRole('textbox').fill('orders');
    await palette.getByText('Orders', { exact: true }).click();

    // The Orders sheet slid over the Desk (its running head copy is unique).
    await expect(page.getByText('A lens over every document', { exact: false })).toBeVisible({
      timeout: 10_000,
    });

    // The quiet ? doorway in the sheet head scopes the panel to Orders.
    await page.getByRole('button', { name: /About this sheet/i }).first().click();
    await expect(page.getByTestId('help-panel-content')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('help-panel-intro')).toContainText(
      'Every purchase order, from drawn to delivered.',
    );
    await shot(page, 'help-panel-orders.png');
  });

  test('help center — 8 human topics, a pinned walkthrough row, no raw surface keys', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/help', { waitUntil: 'domcontentloaded' });

    // Human topic labels (two representative shelves).
    await expect(page.getByText('Getting started', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Ledgers & money', { exact: true })).toBeVisible();

    // The pinned walkthrough row.
    await expect(page.getByRole('link', { name: /The Desk walkthrough/i })).toBeVisible();

    // No raw surface-key prefix leaks into the visible copy.
    await expect(page.getByText('designer-portal/', { exact: false })).toHaveCount(0);

    await shot(page, 'help-center.png', { fullPage: true });

    // Mobile pass at 390px.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/help', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Getting started', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await shot(page, 'mobile-help-center.png', { fullPage: true });
  });

  test('legacy /portal/help redirects to /help', async ({ authenticatedPage: page }) => {
    await page.goto('/portal/help', { waitUntil: 'domcontentloaded' });
    // Wait for the exact destination — a `**/help` glob would match the
    // starting /portal/help too and pass before the redirect resolves.
    await page.waitForURL((url) => url.pathname === '/help', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/help');
  });
});
