import { test, expect } from '@playwright/test';

test.describe('Designer Portal - Product Catalog', () => {
  test('Navigate to product catalog and observe errors', async ({ page }) => {
    // Listen for console errors
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log('Console Error:', msg.text());
      }
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
      console.log('Page Error:', error.message);
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        networkErrors.push(`${response.status()} - ${response.url()}`);
        console.log('Network Error:', response.status(), response.url());
      }
    });

    // Navigate to designer portal
    console.log('Navigating to http://localhost:3000/catalog...');
    await page.goto('http://localhost:3000/catalog', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Wait a bit for the page to fully load
    await page.waitForTimeout(5000);

    // Take a screenshot
    await page.screenshot({
      path: '/home/middle/patina/catalog-screenshot.png',
      fullPage: true
    });

    // Try to find catalog elements
    const catalogContainer = page.locator('[data-testid="catalog-container"], .catalog, main');
    const productCards = page.locator('[data-testid="product-card"], .product-card');

    console.log('\n=== CATALOG PAGE ANALYSIS ===');
    console.log('Page URL:', page.url());
    console.log('Page Title:', await page.title());
    console.log('Catalog container exists:', await catalogContainer.count() > 0);
    console.log('Product cards found:', await productCards.count());

    // Check for error messages on the page
    const errorMessages = page.locator('text=/error|failed|not found/i').first();
    const hasErrorMessage = await errorMessages.count() > 0;
    if (hasErrorMessage) {
      console.log('Error message on page:', await errorMessages.textContent());
    }

    // Log all collected errors
    console.log('\n=== CONSOLE ERRORS ===');
    consoleErrors.forEach((error, i) => console.log(`${i + 1}. ${error}`));

    console.log('\n=== PAGE ERRORS ===');
    pageErrors.forEach((error, i) => console.log(`${i + 1}. ${error}`));

    console.log('\n=== NETWORK ERRORS ===');
    networkErrors.forEach((error, i) => console.log(`${i + 1}. ${error}`));

    // Get page HTML to examine structure
    const pageContent = await page.content();
    console.log('\n=== PAGE CONTENT LENGTH ===');
    console.log(`Total HTML size: ${pageContent.length} characters`);

    // Log the errors for reporting
    console.log('\n=== SUMMARY ===');
    console.log(`Console Errors: ${consoleErrors.length}`);
    console.log(`Page Errors: ${pageErrors.length}`);
    console.log(`Network Errors: ${networkErrors.length}`);
  });
});
