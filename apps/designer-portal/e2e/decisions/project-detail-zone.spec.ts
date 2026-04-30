import { test, expect } from '../fixtures/auth';

/**
 * Project detail — Open Decisions metric tile + Zone 7 Decisions panel
 *
 * NOTE: Playwright's webServer in playwright.config.ts is commented out.
 * Run `pnpm dev:designer` (and a local Supabase reset with seed) before invoking these tests.
 *
 * Seeded project: "Aspen Loft Refresh" — UUID b0000000-0000-0000-0000-0000000000d1
 * The project has 5 seeded decisions; 2 are pending (open) → tile should show "2".
 */

const PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d1';

test.describe('Project detail — Decisions zone', () => {
  test('Open Decisions tile shows non-zero count and links to project decisions', async ({ authenticatedPage: page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto(`/portal/projects/${PROJECT_ID}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // The tile is an <a href="/portal/projects/<id>/decisions"> with the label "Open Decisions"
    // and the count rendered as a sibling span. We assert by selecting the link via href.
    const tile = page.locator(`a[href="/portal/projects/${PROJECT_ID}/decisions"]`).first();
    await expect(tile).toBeVisible({ timeout: 15000 });
    await expect(tile).toContainText(/Open Decisions/i);

    // Pull the numeric count out of the tile and verify it's >= 1.
    // textContent concatenates without spaces (e.g. "Open Decisions4View history →"),
    // so we match digits without word boundaries.
    const tileText = (await tile.textContent()) ?? '';
    const numMatch = tileText.match(/(\d+)/);
    expect(numMatch, `Expected a numeric count in tile text "${tileText}"`).not.toBeNull();
    expect(Number(numMatch![1])).toBeGreaterThan(0);

    expect(pageErrors, `Unhandled page errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toHaveLength(0);
  });

  test('Zone 7 Decisions panel lists seeded decisions and "+ New decision" opens composer modal', async ({ authenticatedPage: page }) => {
    await page.goto(`/portal/projects/${PROJECT_ID}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Zone 7 section heading
    const decisionsHeading = page.getByRole('heading', { name: /^Decisions$/i }).first();
    await decisionsHeading.scrollIntoViewIfNeeded();
    await expect(decisionsHeading).toBeVisible();

    // Seeded pending decision title should be in the panel
    await expect(
      page.getByText(/Dining chairs\s*[—-]\s*Shaker Oak vs Windsor Elm/i).first()
    ).toBeVisible({ timeout: 10000 });

    // Open the composer modal
    const newBtn = page.getByRole('button', { name: /\+\s*New decision/i });
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    // Modal heading
    await expect(page.getByRole('heading', { name: /^New decision$/i })).toBeVisible({ timeout: 10000 });
  });
});
