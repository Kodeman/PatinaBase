import { test, expect, type Page } from '@playwright/test';

// Drop-3 screenshot generator (S7). NOT an assertion suite — it drives the
// seeded surfaces and writes PNGs to docs/design/back-of-house/drops/drop-3/.
// READ-ONLY (opens dialogs, never commits/approves), so it leaves the fixtures
// intact for the behavioral specs. Run explicitly against a freshly-seeded stack
// (reset → functions serve → seed → S1 fixtures → S7 exceptions fixtures):
//   pnpm --filter @patina/admin-portal exec playwright test boh-drop3-screens --project=chromium

test.describe.configure({ mode: 'serial' });

const DROP = '../../docs/design/back-of-house/drops/drop-3';
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

test.beforeEach(async ({ page }) => {
  await signInAsAdmin(page);
});

test('01 — exceptions list (1440×900)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/fulfillment/exceptions');
  await expect(page.getByTestId('exceptions-list')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DROP}/01-exceptions-list.png`, fullPage: true });
});

test('02 — damage case file with the ledger consequence in mono before commit (1440×900)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/fulfillment/exceptions');
  await expect(page.getByTestId('exceptions-list')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-testid="exception-row"]', { hasText: 'Damage' }).first().click();
  await expect(page.getByTestId('case-file')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('respath-damage_vendor_claim').click();
  await page.getByTestId('respath-amount').fill('1180');
  await expect(page.getByTestId('mono-consequence')).toContainText('Dr');
  await page.getByTestId('respath-cause-code').selectOption('concealed_damage');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DROP}/02-case-file-mono-consequence.png`, fullPage: true });
});

test('03 — settlement dialog, $34 in tolerance, projected posting (1440×900)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/fulfillment');
  await expect(page.getByTestId('queue-bands')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-testid="queue-row"]', { hasText: 'Calloway' }).first().click();
  await expect(page.getByTestId('workbench-root')).toBeVisible({ timeout: 15000 });
  await page.locator('a[href*="/fulfillment/pos/"]').first().click();
  await expect(page.getByTestId('composer-root')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('composer-settle-open').click();
  await expect(page.getByTestId('settle-dialog')).toBeVisible();
  const invoice = page.getByTestId('settle-invoice');
  await expect(async () => {
    expect(Number(await invoice.inputValue())).toBeGreaterThan(0);
  }).toPass({ timeout: 10000 });
  const base = Number(await invoice.inputValue());
  await invoice.fill((base + 34).toFixed(2));
  await expect(page.getByTestId('settle-variance')).toContainText('+$34.00');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DROP}/03-settlement-dialog.png` });
});

test('04 — Leah substitution card (390×844)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/mission-control?assignee=leah');
  await expect(page.getByTestId('leah-review-deck')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="leah-card"][data-card-kind="substitution"]')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DROP}/04-leah-substitution-card.png` });
});
