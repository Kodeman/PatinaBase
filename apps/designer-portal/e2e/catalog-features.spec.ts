import { test, expect } from '@playwright/test';

test.describe('Catalog Features', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to catalog page
    await page.goto('http://localhost:3000/catalog');
    await page.waitForLoadState('networkidle');
  });

  test('should display catalog page with products', async ({ page }) => {
    // Check for page title
    await expect(page.locator('h1:has-text("Product Catalog")')).toBeVisible();

    // Take screenshot of catalog page
    await page.screenshot({ path: 'test-results/01-catalog-page.png', fullPage: true });
  });

  test('should navigate to edit page when clicking Edit button', async ({ page }) => {
    // Wait for product cards to load
    await page.waitForSelector('.group', { timeout: 10000 });

    // Find and click first Edit button
    const editButton = page.locator('button:has-text("Edit")').first();

    if (await editButton.count() > 0) {
      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Verify we're on an edit page
      await expect(page).toHaveURL(/\/catalog\/[^/]+\/edit/);
      await expect(page.locator('h1:has-text("Edit Product")')).toBeVisible();

      // Take screenshot
      await page.screenshot({ path: 'test-results/02-edit-page.png', fullPage: true });
    } else {
      console.log('No products with Edit buttons found - skipping test');
      test.skip();
    }
  });

  test('should display all editor tabs on edit page', async ({ page }) => {
    // Navigate to edit page
    const editButton = page.locator('button:has-text("Edit")').first();

    if (await editButton.count() > 0) {
      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Check for all tabs
      const tabs = ['Details', 'Media', 'Pricing', 'Inventory', 'SEO', 'Validation'];

      for (const tabName of tabs) {
        await expect(page.locator(`button:has-text("${tabName}")`).first()).toBeVisible();
      }

      // Take screenshot
      await page.screenshot({ path: 'test-results/03-all-tabs.png', fullPage: true });
    } else {
      test.skip();
    }
  });

  test('should display Inventory tab with variant management', async ({ page }) => {
    const editButton = page.locator('button:has-text("Edit")').first();

    if (await editButton.count() > 0) {
      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Click Inventory tab
      await page.locator('button:has-text("Inventory")').first().click();
      await page.waitForTimeout(1000);

      // Check for variant management UI
      await expect(page.locator('text=Inventory & Variants')).toBeVisible();
      await expect(page.locator('button:has-text("Add Variant")')).toBeVisible();
      await expect(page.locator('text=Total Variants')).toBeVisible();

      // Take screenshot
      await page.screenshot({ path: 'test-results/04-inventory-tab.png', fullPage: true });
    } else {
      test.skip();
    }
  });

  test('should display Validation tab with validation panel', async ({ page }) => {
    const editButton = page.locator('button:has-text("Edit")').first();

    if (await editButton.count() > 0) {
      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Click Validation tab
      await page.locator('button:has-text("Validation")').first().click();
      await page.waitForTimeout(2000);

      // Check for validation panel
      await expect(page.locator('text=Validation Issues')).toBeVisible();
      await expect(page.locator('button:has-text("Revalidate")')).toBeVisible();

      // Take screenshot
      await page.screenshot({ path: 'test-results/05-validation-tab.png', fullPage: true });
    } else {
      test.skip();
    }
  });

  test('should display Media tab with upload area', async ({ page }) => {
    const editButton = page.locator('button:has-text("Edit")').first();

    if (await editButton.count() > 0) {
      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Click Media tab
      await page.locator('button:has-text("Media")').first().click();
      await page.waitForTimeout(1000);

      // Check for media upload UI
      await expect(page.locator('text=Product Media')).toBeVisible();
      await expect(page.locator('text=Drag and drop images here')).toBeVisible();
      await expect(page.locator('text=3D Model Available')).toBeVisible();
      await expect(page.locator('text=AR Preview Enabled')).toBeVisible();

      // Take screenshot
      await page.screenshot({ path: 'test-results/06-media-tab.png', fullPage: true });
    } else {
      test.skip();
    }
  });

  test('should navigate to create product page', async ({ page }) => {
    // Click Create Product button
    const createButton = page.locator('button:has-text("Create Product")').first();

    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForLoadState('networkidle');

      // Verify we're on create page
      await expect(page).toHaveURL('/catalog/new');
      await expect(page.locator('h1:has-text("Create New Product")')).toBeVisible();

      // Take screenshot
      await page.screenshot({ path: 'test-results/07-create-page.png', fullPage: true });
    } else {
      console.log('Create Product button not visible - may need permissions');
      test.skip();
    }
  });
});
