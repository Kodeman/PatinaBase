import { test, expect, type Page } from '@playwright/test';

// Drop-1 screenshot generator (S2). NOT an assertion suite — it drives the
// seeded local stack and writes the four 1440×900 full-page PNGs into
// docs/design/back-of-house/drops/drop-1/. Run explicitly:
//   pnpm exec playwright test e2e/boh-drop1-screens.spec.ts --project=chromium
// Requires a CLEAN seed (order 1 pre-confirm): reset → seed:fulfillment →
// fixtures. Serial: 02 (pre-confirm) must precede 04 (which confirms order 1).

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 900 } });

// Relative to the Playwright CWD (apps/admin-portal): ../../ = worktree root.
const DROP = '../../docs/design/back-of-house/drops/drop-1';

async function signIn(page: Page) {
  await page.goto('/auth/signin');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('button:has-text("Sign in with email")').first().click();
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.locator('input[type="email"]').fill('admin@patina.dev');
  await page.locator('input[type="password"]').fill('password123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/auth/signin'), { timeout: 20000 });
}

async function openOrder(page: Page, clientName: string) {
  await page.goto('/fulfillment');
  await expect(page.getByTestId('queue-bands')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-testid="queue-row"]', { hasText: clientName }).first().click();
  await page.waitForURL((u) => /\/fulfillment\/orders\//.test(u.pathname), { timeout: 15000 });
  await expect(page.getByTestId('workbench-root')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(400); // let the strip settle
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('01 — queue three bands', async ({ page }) => {
  await page.goto('/fulfillment');
  await expect(page.getByTestId('queue-bands')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DROP}/01-queue-three-bands.png`, fullPage: true });
});

test('02 — workbench proposed split (5-vendor, pre-confirm)', async ({ page }) => {
  await openOrder(page, 'Priya Anand');
  await expect(page.getByTestId('wb-po-card')).toHaveCount(5);
  await page.screenshot({ path: `${DROP}/02-workbench-proposed-split.png`, fullPage: true });
});

test('03 — workbench unmapped blocking', async ({ page }) => {
  await openOrder(page, 'Odalys Ferreira');
  await expect(page.getByTestId('wb-confirm-button')).toBeDisabled();
  await page.screenshot({ path: `${DROP}/03-workbench-unmapped-blocking.png`, fullPage: true });
});

test('04 — workbench post-confirm (5 PO drafts)', async ({ page }) => {
  await openOrder(page, 'Priya Anand');
  await page.getByTestId('wb-confirm-button').click();
  await expect(page.getByTestId('wb-confirm-bar')).toHaveAttribute('data-confirmed', 'true', {
    timeout: 15000,
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DROP}/04-workbench-post-confirm.png`, fullPage: true });
});
