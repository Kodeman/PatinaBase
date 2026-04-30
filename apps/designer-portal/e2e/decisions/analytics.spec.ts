import { test, expect } from '../fixtures/auth';

/**
 * Decision Analytics page
 *
 * NOTE: Playwright's webServer in playwright.config.ts is commented out.
 * Run `pnpm dev:designer` (and a local Supabase reset with seed) before invoking these tests.
 *
 * The analytics page renders four MetricBlock tiles:
 *   "Total Decisions", "On-Time Rate", "Avg Response", "Open Decisions"
 * plus "Response Time by Type", "By Client", and "Bottleneck Phases" sections.
 */

test.describe('Decision Analytics', () => {
  test('renders metric tiles without unhandled errors', async ({ authenticatedPage: page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/portal/decisions/analytics', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Page heading
    await expect(page.getByRole('heading', { name: /Decision Insights/i, level: 1 })).toBeVisible({ timeout: 15000 });

    // Four metric tile labels — these come from <MetricBlock label=… />
    await expect(page.getByText(/^Total Decisions$/i).first()).toBeVisible();
    await expect(page.getByText(/^On-Time Rate$/i).first()).toBeVisible();
    await expect(page.getByText(/^Avg Response$/i).first()).toBeVisible();
    await expect(page.getByText(/^Open Decisions$/i).first()).toBeVisible();

    // Section headers should render even when their data lists may be empty.
    await expect(page.getByRole('heading', { name: /Response Time by Type/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /By Client/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Bottleneck Phases/i })).toBeVisible();

    // No unhandled page errors — we explicitly do NOT assert on console warnings,
    // only on uncaught exceptions / runtime errors surfaced via `pageerror`.
    expect(pageErrors, `Unhandled page errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toHaveLength(0);
  });
});
