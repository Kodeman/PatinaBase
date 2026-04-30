import { test, expect } from '../fixtures/auth';

/**
 * Decisions Dashboard — listing + filter chips
 *
 * NOTE: Playwright's webServer in playwright.config.ts is commented out.
 * Run `pnpm dev:designer` (and a local Supabase reset with seed) before invoking these tests.
 *
 * Seed data assumed (after `pnpm supabase reset`):
 *   - 5 decisions on project "Aspen Loft Refresh" for designer designer@patina.dev
 *     · ...d2c01 Pendant lights — DRAFT
 *     · ...d2c02 Dining chairs — Shaker Oak vs Windsor Elm — PENDING (due in 5 days)
 *     · ...d2c03 Rug color — Natural vs Sand — PENDING + OVERDUE (due 3 days ago)
 *     · ...d2c04 Concept direction approval — RESPONDED
 *     · ...d2c05 Hardware finish — EXPIRED
 *
 * The auth fixture currently signs in with `dev@patina.com` / `password`. Whether the
 * fixture user exactly matches the seeded designer is irrelevant for shape-level
 * assertions here — what matters is that the dashboard renders and the seeded
 * decisions are visible to the authenticated principal.
 */

test.describe('Decisions Dashboard — filters', () => {
  test('renders dashboard with seeded pending and overdue decisions', async ({ authenticatedPage: page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/portal/decisions', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Dashboard heading
    await expect(page.getByRole('heading', { name: /^Decisions$/i, level: 1 })).toBeVisible({ timeout: 15000 });

    // Pending seeded decision should appear (default filter is "All Open" → pending only)
    // Use a regex that accepts em-dash or hyphen-minus between the title parts.
    const diningChairs = page.getByText(/Dining chairs\s*[—-]\s*Shaker Oak vs Windsor Elm/i).first();
    await expect(diningChairs).toBeVisible({ timeout: 15000 });

    // Overdue pending decision should also appear (still pending → in default Open filter)
    const rugColor = page.getByText(/Rug color\s*[—-]\s*Natural vs Sand/i).first();
    await expect(rugColor).toBeVisible();

    // The overdue card should carry data-overdue="true"
    const overdueCard = page.locator('[data-overdue="true"]').first();
    await expect(overdueCard).toBeVisible();
    await expect(overdueCard).toContainText(/Rug color/i);

    expect(pageErrors, `Unhandled page errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toHaveLength(0);
  });

  test('Overdue filter narrows the list to overdue decisions only', async ({ authenticatedPage: page }) => {
    await page.goto('/portal/decisions', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Wait for default list to render at least one card
    await expect(page.getByText(/Dining chairs\s*[—-]\s*Shaker Oak vs Windsor Elm/i).first()).toBeVisible({ timeout: 15000 });

    // Click the "Overdue" filter chip — FilterRow renders chips as buttons containing the label text.
    const overdueChip = page.getByRole('button', { name: /^\s*Overdue\s*\d*\s*$/i }).first();
    await expect(overdueChip).toBeVisible();
    await overdueChip.click();

    // Allow re-render
    await page.waitForLoadState('networkidle');

    // Overdue rug-color decision should remain
    await expect(page.getByText(/Rug color\s*[—-]\s*Natural vs Sand/i).first()).toBeVisible({ timeout: 10000 });

    // The non-overdue pending decision (Dining chairs, due in 5 days) should NOT be visible
    await expect(page.getByText(/Dining chairs\s*[—-]\s*Shaker Oak vs Windsor Elm/i)).toHaveCount(0);

    // Every remaining decision card (data-overdue attribute present) should be marked overdue.
    const cards = page.locator('[data-overdue]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i)).toHaveAttribute('data-overdue', 'true');
    }
  });
});
