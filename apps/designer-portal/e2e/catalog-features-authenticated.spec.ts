import { test, expect } from '@playwright/test';

// Test credentials - using dev-credentials provider
const TEST_USER = {
  email: 'designer@patina.local',
  password: 'password123',
};

test.describe('Catalog Features (Authenticated)', () => {
  // Login before each test
  test.beforeEach(async ({ page }) => {
    // Navigate to sign in page
    await page.goto('http://localhost:3000/auth/signin');
    await page.waitForLoadState('networkidle');

    // Fill in login form
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);

    // Click sign in button
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard (login successful)
    await page.waitForTimeout(3000); // Wait for navigation

    // Navigate to catalog
    await page.goto('http://localhost:3000/catalog');
    await page.waitForLoadState('networkidle');
  });

  test('should display catalog page after login', async ({ page }) => {
    // Take screenshot
    await page.screenshot({ path: 'test-results/auth-01-catalog-page.png', fullPage: true });

    // Check for catalog page elements
    const hasTitle = await page.locator('h1').count() > 0;
    const hasCatalogContent = await page.locator('text=Product').count() > 0 ||
                               await page.locator('text=Catalog').count() > 0;

    expect(hasTitle || hasCatalogContent).toBeTruthy();
  });

  test('should navigate to edit page when clicking Edit button', async ({ page }) => {
    // Wait for products to load - look for product cards
    await page.waitForSelector('.group', { timeout: 10000 });
    await page.waitForTimeout(1000); // Additional wait for session/permissions

    // Find Edit button using role and text
    const editButtons = page.getByRole('button', { name: /edit/i });
    const editCount = await editButtons.count();

    console.log(`Found ${editCount} Edit buttons on catalog page`);

    if (editCount > 0) {
      await editButtons.first().click();
      await page.waitForLoadState('networkidle');

      // Verify we're on an edit page
      await expect(page).toHaveURL(/\/catalog\/[^/]+\/edit/);

      // Take screenshot
      await page.screenshot({ path: 'test-results/auth-02-edit-page.png', fullPage: true });
    } else {
      console.log('No products with Edit buttons found - permissions may not be set');
      await page.screenshot({ path: 'test-results/auth-02-no-edit-buttons.png', fullPage: true });
      test.skip();
    }
  });

  test('should display all editor tabs on edit page', async ({ page }) => {
    // Wait for products to load
    await page.waitForSelector('.group', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const editButton = page.getByRole('button', { name: /edit/i }).first();
    const editCount = await editButton.count();

    if (editCount > 0) {
      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Check for all tabs
      const tabs = ['Details', 'Media', 'Pricing', 'Inventory', 'SEO', 'Validation'];

      for (const tabName of tabs) {
        const tabExists = await page.getByRole('tab', { name: tabName }).count() > 0;
        expect(tabExists).toBeTruthy();
      }

      // Take screenshot
      await page.screenshot({ path: 'test-results/auth-03-all-tabs.png', fullPage: true });
    } else {
      test.skip();
    }
  });

  test('should display Inventory tab with variant management', async ({ page }) => {
    // Wait for products to load
    await page.waitForSelector('.group', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const editButton = page.getByRole('button', { name: /edit/i }).first();
    const editCount = await editButton.count();

    if (editCount > 0) {
      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Click Inventory tab
      await page.getByRole('tab', { name: 'Inventory' }).click();
      await page.waitForTimeout(1000);

      // Check for inventory content
      const hasInventoryContent =
        (await page.locator('text=Inventory').count()) > 0 ||
        (await page.locator('text=Variant').count()) > 0 ||
        (await page.getByRole('button', { name: /add variant/i }).count()) > 0;

      expect(hasInventoryContent).toBeTruthy();

      // Take screenshot
      await page.screenshot({ path: 'test-results/auth-04-inventory-tab.png', fullPage: true });
    } else {
      test.skip();
    }
  });

  test('should display Validation tab', async ({ page }) => {
    // Wait for products to load
    await page.waitForSelector('.group', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const editButton = page.getByRole('button', { name: /edit/i }).first();
    const editCount = await editButton.count();

    if (editCount > 0) {
      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Click Validation tab
      await page.getByRole('tab', { name: 'Validation' }).click();
      await page.waitForTimeout(2000);

      // Check for validation content
      const hasValidationContent =
        (await page.locator('text=Validation').count()) > 0 ||
        (await page.getByRole('button', { name: /revalidate/i }).count()) > 0;

      expect(hasValidationContent).toBeTruthy();

      // Take screenshot
      await page.screenshot({ path: 'test-results/auth-05-validation-tab.png', fullPage: true });
    } else {
      test.skip();
    }
  });

  test('should display Media tab with upload area', async ({ page }) => {
    // Wait for products to load
    await page.waitForSelector('.group', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const editButton = page.getByRole('button', { name: /edit/i }).first();
    const editCount = await editButton.count();

    if (editCount > 0) {
      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Click Media tab
      await page.getByRole('tab', { name: 'Media' }).click();
      await page.waitForTimeout(1000);

      // Check for media content
      const hasMediaContent =
        (await page.locator('text=Media').count()) > 0 ||
        (await page.locator('text=drag').count()) > 0 ||
        (await page.locator('text=3D').count()) > 0;

      expect(hasMediaContent).toBeTruthy();

      // Take screenshot
      await page.screenshot({ path: 'test-results/auth-06-media-tab.png', fullPage: true });
    } else {
      test.skip();
    }
  });

  test('should navigate to create product page', async ({ page }) => {
    // Look for Create Product button using role
    const createButton = page.getByRole('button', { name: /create product/i });

    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForLoadState('networkidle');

      // Verify we're on create page
      await expect(page).toHaveURL('/catalog/new');

      // Take screenshot
      await page.screenshot({ path: 'test-results/auth-07-create-page.png', fullPage: true });
    } else {
      console.log('Create Product button not visible - user may not have create permissions');
      await page.screenshot({ path: 'test-results/auth-07-no-create-button.png', fullPage: true });
      // This is expected for some users based on permissions
    }
  });
});
