import { test, expect } from '@playwright/test';
import { WaitHelpers } from '../utils/wait-helpers';

test.describe('Catalog Page - Product List Error Investigation', () => {
  test('Test catalog page and identify product list errors', async ({ page }) => {
    const errors: any[] = [];
    const warnings: any[] = [];
    const networkFailures: any[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push({ type: 'console_error', text: msg.text() });
      } else if (msg.type() === 'warning') {
        warnings.push({ type: 'console_warning', text: msg.text() });
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      errors.push({ type: 'page_error', message: error.message, stack: error.stack });
    });

    // Capture failed network requests
    page.on('response', (response) => {
      if (response.status() >= 400) {
        networkFailures.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        });
      }
    });

    // Navigate to catalog
    console.log('Navigating to catalog page...');
    await page.goto('http://localhost:3000/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // Wait for page to render and network to be idle
    await WaitHelpers.waitForNetworkIdle(page);

    // Check if catalog API calls are being made
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('3011') || request.url().includes('catalog')) {
        apiCalls.push(request.url());
      }
    });

    // Look for specific elements
    const hasProductGrid = await page.locator('.grid, [class*="grid"]').count();
    const hasError = await page.locator('text=/error|failed/i').count();
    const hasLoading = await page.locator('text=/loading/i').count();
    const productCards = await page.locator('[class*="product"], [class*="card"]').count();

    // Take a screenshot
    await page.screenshot({ path: 'test-results/catalog-investigation.png', fullPage: true });

    // Print results
    console.log('\n=== INVESTIGATION RESULTS ===');
    console.log('Console Errors:', errors.length);
    console.log('Console Warnings:', warnings.length);
    console.log('Network Failures:', networkFailures.length);
    console.log('API Calls Made:', apiCalls.length);
    console.log('Has Product Grid:', hasProductGrid > 0);
    console.log('Has Error Message:', hasError > 0);
    console.log('Has Loading State:', hasLoading > 0);
    console.log('Product Cards Found:', productCards);

    if (errors.length > 0) {
      console.log('\n=== ERRORS ===');
      errors.forEach((err, i) => {
        console.log(`${i + 1}. [${err.type}]`, err.text || err.message);
      });
    }

    if (networkFailures.length > 0) {
      console.log('\n=== NETWORK FAILURES ===');
      networkFailures.forEach((fail, i) => {
        console.log(`${i + 1}. ${fail.status} - ${fail.url}`);
      });
    }

    if (apiCalls.length > 0) {
      console.log('\n=== API CALLS ===');
      apiCalls.forEach((call, i) => {
        console.log(`${i + 1}. ${call}`);
      });
    }

    // Check if catalog service is accessible
    console.log('\n=== CHECKING CATALOG SERVICE ===');
    const catalogHealthCheck = await page.request.get('http://192.168.1.16:3011/health').catch(e => {
      console.log('Catalog service health check failed:', e.message);
      return null;
    });

    if (catalogHealthCheck) {
      console.log('Catalog service status:', catalogHealthCheck.status());
      console.log('Catalog service response:', await catalogHealthCheck.text());
    }

    // Try to manually fetch products
    console.log('\n=== TESTING PRODUCT API DIRECTLY ===');
    const productsResponse = await page.request.get('http://192.168.1.16:3011/products?status=published&page=1&pageSize=24').catch(e => {
      console.log('Product API call failed:', e.message);
      return null;
    });

    if (productsResponse) {
      console.log('Products API status:', productsResponse.status());
      const productsData = await productsResponse.text();
      console.log('Products API response length:', productsData.length);
      console.log('Products API response preview:', productsData.substring(0, 500));
    }
  });
});
