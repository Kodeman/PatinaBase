/**
 * Client Portal - Account Page E2E Tests
 *
 * Tests profile editing persistence and sign-out-everywhere confirmation flow.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';

async function loginAsClient(page: any) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill(
    'input[name="email"], input[type="email"]',
    'client@test.patina.local'
  );
  await page.fill(
    'input[name="password"], input[type="password"]',
    'TestClient123!'
  );
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/projects/, { timeout: 15000 });
}

test.describe('Client Portal - Account', () => {
  test('edit full_name persists across reload', async ({ page }) => {
    await loginAsClient(page);
    await page.goto(`${BASE_URL}/account`);

    const newName = `Test Client ${Date.now()}`;
    await page.fill('[data-testid="account-full-name"]', newName);
    await page.click('[data-testid="account-save"]');

    await expect(page.getByText(/Saved/i)).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator('[data-testid="account-full-name"]')).toHaveValue(newName);
  });

  test('sign-out-everywhere requires confirmation', async ({ page }) => {
    await loginAsClient(page);
    await page.goto(`${BASE_URL}/account`);

    await page.click('[data-testid="account-signout-everywhere"]');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(/\/account/);
  });
});
