import { test, expect } from '@playwright/test';

test.describe('Designer Dashboard Load Test', () => {
  let consoleErrors: string[] = [];
  let pageErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    // Collect console errors
    consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Collect page errors
    pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error);
    });
  });

  test('should load dashboard without module resolution errors', async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for the page to be interactive
    await page.waitForLoadState('domcontentloaded');

    // Check for module not found errors
    const hasModuleError = consoleErrors.some(
      (error) =>
        error.includes('Module not found') ||
        error.includes("Can't resolve") ||
        error.includes('@/components/layout/header')
    );

    const hasPageError = pageErrors.some(
      (error) =>
        error.message.includes('Module not found') ||
        error.message.includes("Can't resolve") ||
        error.message.includes('@/components/layout/header')
    );

    // Log errors for debugging
    if (consoleErrors.length > 0) {
      console.log('Console errors found:');
      consoleErrors.forEach((error, index) => {
        console.log(`  \${index + 1}. \${error}`);
      });
    }

    if (pageErrors.length > 0) {
      console.log('Page errors found:');
      pageErrors.forEach((error, index) => {
        console.log(`  \${index + 1}. \${error.message}`);
      });
    }

    // Assert no module resolution errors
    expect(hasModuleError, 'Should not have module resolution errors in console').toBe(false);
    expect(hasPageError, 'Should not have module resolution errors on page').toBe(false);

    // Verify page loaded with expected elements
    // The page should have some content, not be blank
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent).toBeTruthy();
  });

  test('should display main layout components', async ({ page }) => {
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for the main element to appear
    const mainElement = page.locator('main');
    await expect(mainElement).toBeVisible({ timeout: 10000 });

    // Verify no critical errors that would prevent rendering
    expect(pageErrors.length).toBe(0);
  });

  test.afterEach(async () => {
    // Report summary
    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      console.log('\n=== Error Summary ===');
      console.log(`Console errors: \${consoleErrors.length}`);
      console.log(`Page errors: \${pageErrors.length}`);
    }
  });
});
