import { test, expect } from '@playwright/test';
import { WaitHelpers } from '../utils/wait-helpers';

test.describe('Catalog Page - Debug', () => {
  test('Navigate to catalog without auth and observe errors', async ({ page, context }) => {
    // Collect all errors
    const consoleErrors: Array<{ type: string; message: string }> = [];
    const networkErrors: Array<{ status: number; url: string; statusText: string }> = [];
    const pageErrors: string[] = [];

    // Listen to console messages
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        consoleErrors.push({
          type,
          message: msg.text()
        });
        console.log(`[CONSOLE ${type.toUpperCase()}]:`, msg.text());
      }
    });

    // Listen to page errors
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
      console.log('[PAGE ERROR]:', error.message);
    });

    // Listen to failed network requests
    page.on('response', (response) => {
      if (response.status() >= 400) {
        const error = {
          status: response.status(),
          url: response.url(),
          statusText: response.statusText()
        };
        networkErrors.push(error);
        console.log(`[NETWORK ERROR]:`, error);
      }
    });

    // Listen to request failures
    page.on('requestfailed', (request) => {
      console.log('[REQUEST FAILED]:', request.url(), request.failure()?.errorText);
    });

    console.log('\n=== NAVIGATING TO CATALOG PAGE ===\n');

    try {
      // Navigate to catalog page
      await page.goto('http://localhost:3000/catalog', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      console.log('\n=== PAGE LOADED ===');
      console.log('URL:', page.url());
      console.log('Title:', await page.title());

      // Wait for any async operations and network activity to complete
      await WaitHelpers.waitForNetworkIdle(page);

      // Take screenshot
      await page.screenshot({
        path: 'test-results/catalog-debug-screenshot.png',
        fullPage: true
      });
      console.log('Screenshot saved to: test-results/catalog-debug-screenshot.png');

      // Check what's visible on the page
      const bodyText = await page.locator('body').textContent();
      console.log('\n=== PAGE CONTENT ===');
      console.log('Body text length:', bodyText?.length || 0);
      if (bodyText && bodyText.length < 500) {
        console.log('Body text:', bodyText);
      }

      // Look for common elements
      const hasNav = await page.locator('nav').count() > 0;
      const hasMain = await page.locator('main').count() > 0;
      const hasHeader = await page.locator('header, h1, h2').count() > 0;
      const hasCatalog = await page.locator('[data-testid*="catalog"], .catalog, #catalog').count() > 0;
      const hasProducts = await page.locator('[data-testid*="product"], .product-card, .product-grid').count() > 0;
      const hasError = await page.locator('text=/error|failed|something went wrong/i').count() > 0;
      const hasLoading = await page.locator('text=/loading|spinner|skeleton/i').count() > 0;

      console.log('\n=== PAGE ELEMENTS ===');
      console.log('Has navigation:', hasNav);
      console.log('Has main content:', hasMain);
      console.log('Has header:', hasHeader);
      console.log('Has catalog elements:', hasCatalog);
      console.log('Has product elements:', hasProducts);
      console.log('Has error message:', hasError);
      console.log('Has loading state:', hasLoading);

      if (hasError) {
        const errorText = await page.locator('text=/error|failed|something went wrong/i').first().textContent();
        console.log('Error message:', errorText);
      }

      // Check for API calls
      console.log('\n=== SUMMARY ===');
      console.log('Console Errors:', consoleErrors.length);
      console.log('Page Errors:', pageErrors.length);
      console.log('Network Errors:', networkErrors.length);

      if (consoleErrors.length > 0) {
        console.log('\n=== CONSOLE ERRORS DETAIL ===');
        consoleErrors.forEach((err, i) => {
          console.log(`${i + 1}. [${err.type}] ${err.message}`);
        });
      }

      if (networkErrors.length > 0) {
        console.log('\n=== NETWORK ERRORS DETAIL ===');
        networkErrors.forEach((err, i) => {
          console.log(`${i + 1}. ${err.status} ${err.statusText} - ${err.url}`);
        });
      }

      if (pageErrors.length > 0) {
        console.log('\n=== PAGE ERRORS DETAIL ===');
        pageErrors.forEach((err, i) => {
          console.log(`${i + 1}. ${err}`);
        });
      }

      // Get network activity
      const performanceTiming = await page.evaluate(() => {
        return {
          loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
          domReady: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
          responseTime: performance.timing.responseEnd - performance.timing.requestStart
        };
      });

      console.log('\n=== PERFORMANCE ===');
      console.log('Load time:', performanceTiming.loadTime, 'ms');
      console.log('DOM ready:', performanceTiming.domReady, 'ms');
      console.log('Response time:', performanceTiming.responseTime, 'ms');

    } catch (error) {
      console.error('\n=== NAVIGATION ERROR ===');
      console.error(error);

      // Try to take screenshot anyway
      try {
        await page.screenshot({
          path: 'test-results/catalog-debug-error-screenshot.png',
          fullPage: true
        });
        console.log('Error screenshot saved');
      } catch (e) {
        console.log('Could not save error screenshot');
      }
    }
  });
});
