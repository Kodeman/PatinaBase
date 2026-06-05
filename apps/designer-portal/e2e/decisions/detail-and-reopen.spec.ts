import { createClient } from '@supabase/supabase-js';
import { test, expect } from '../fixtures/auth';

/**
 * Decision Detail — Resolution Record + Reopen flow
 *
 * NOTE: Playwright's webServer in playwright.config.ts is commented out.
 * Run `pnpm dev:designer` (and a local Supabase reset with seed) before invoking these tests.
 *
 * Targets the seeded RESPONDED decision:
 *   id    = b0000000-0000-0000-0000-0000000d2c04
 *   title = "Concept direction approval"
 *   selected option name = "Scandinavian Warm"
 */

const RESPONDED_DECISION_ID = 'b0000000-0000-0000-0000-0000000d2c04';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

test.describe('Decision detail — responded decision and reopen', () => {
  // The test itself reopens the seeded decision to `pending` and (by design)
  // does not respond again — which left every SUBSEQUENT run failing at the
  // Resolution Record assertion. Reset the row to `responded` before each run
  // so the spec is idempotent. (Reopen only flips `status`; the seeded
  // selected-option flags survive, so this one UPDATE fully restores state.)
  test.beforeEach(async () => {
    if (!SERVICE_ROLE_KEY) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY env var is required for detail-and-reopen e2e tests',
      );
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin
      .from('client_decisions')
      .update({ status: 'responded' })
      .eq('id', RESPONDED_DECISION_ID);
    if (error) throw new Error(`Failed to reset seeded decision: ${error.message}`);
  });

  test('shows Resolution Record with selected option, then reopens to pending', async ({ authenticatedPage: page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto(`/portal/decisions/${RESPONDED_DECISION_ID}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // The entity h1 was removed in the page-header migration; the global
    // sub-nav breadcrumb ("Decisions › Concept direction approval") now carries
    // the decision title. Assert it there to confirm the right page loaded.
    const breadcrumb = page.locator('nav', { hasText: 'Decisions' }).first();
    await expect(breadcrumb).toContainText('Concept direction approval', { timeout: 15000 });

    // Resolution Record section header (only renders when status === 'responded')
    await expect(page.getByRole('heading', { name: /Resolution Record/i })).toBeVisible();

    // The selected option name should appear in the resolution detail rows
    await expect(page.getByText(/Scandinavian Warm/i).first()).toBeVisible();

    // Status pill currently reads "Resolved" (the StatusBadge maps responded → "Resolved")
    const resolvedPill = page.getByText(/^Resolved$/i).first();
    await expect(resolvedPill).toBeVisible();

    // Click Reopen Decision
    const reopenBtn = page.getByRole('button', { name: /Reopen Decision/i });
    await expect(reopenBtn).toBeVisible();
    await reopenBtn.click();

    // After mutation, the StatusBadge should now show "pending" (lowercase)
    // The "Resolved" pill should disappear and a "pending" pill should appear.
    await expect(page.getByText(/^pending$/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^Resolved$/i)).toHaveCount(0);

    expect(pageErrors, `Unhandled page errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toHaveLength(0);
  });
});
