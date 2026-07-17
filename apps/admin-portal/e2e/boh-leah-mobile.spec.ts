import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Back of House · the Leah substitution rule (S7, R1.4/§9.4) — the substitution
// card on the EXISTING LeahReviewDeck at /mission-control?assignee=leah, driven
// at a phone viewport (390×844, one card per screen). Chromium-only. SERIAL.
// Consumes the seeded substitution review — reseed to re-run.
//
// Requires the seeded stack + scripts/seed-fulfillment-exceptions.sql (routes a
// substitution to Leah) + functions serve (the approve drafts the client note).
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 390, height: 844 } });

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

test('the substitution card appears on Leah\'s route, and Approve advances + resolves the exception', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/mission-control?assignee=leah');
  await expect(page.getByTestId('leah-review-deck')).toBeVisible({ timeout: 15000 });

  // a substitution card is present, with the two swatches + delta strip
  const subCard = page.locator('[data-testid="leah-card"][data-card-kind="substitution"]');
  await expect(subCard).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('leah-delta-strip')).toContainText('PRICE Δ');
  await expect(page.getByTestId('leah-delta-strip')).toContainText('CLIENT:');
  await expect(page.getByTestId('leah-pass')).toBeVisible();
  await expect(page.getByTestId('leah-approve')).toBeVisible();

  // Approve → her ruling writes back + drafts the client note; the deck advances
  await page.getByTestId('leah-approve').click();
  await expect(subCard).toHaveCount(0, { timeout: 10000 });

  // the exception is now resolved (visible on the desk)
  await page.goto('/fulfillment/exceptions');
  await expect(page.getByTestId('exceptions-list')).toBeVisible({ timeout: 15000 });
  const subRow = page.locator('[data-testid="exception-row"]', { hasText: 'Substitution' }).first();
  await expect(subRow).toHaveAttribute('data-status', 'resolved', { timeout: 10000 });
});
