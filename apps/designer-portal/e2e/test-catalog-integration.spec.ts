import { test, expect } from '@playwright/test';

test.describe('Catalog Integration Test', () => {
  test('should navigate to catalog and check authentication flow', async ({ page }) => {
    // Enable console logging
    page.on('console', (msg) => {
      console.log(`[Browser Console - ${msg.type()}]:`, msg.text());
    });

    // Enable error tracking
    page.on('pageerror', (error) => {
      console.log('[Browser Error]:', error.message);
    });

    // 1. Navigate to homepage
    console.log('Step 1: Navigating to homepage...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    console.log('Current URL after homepage:', page.url());

    // 2. Try to navigate to catalog
    console.log('\nStep 2: Navigating to /catalog...');
    await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle', timeout: 10000 });
    console.log('Current URL after catalog navigation:', page.url());

    // 3. Check if we're on sign-in page
    if (page.url().includes('/auth/signin')) {
      console.log('\nStep 3: Redirected to sign-in page, attempting sign-in...');

      // Sign in
      await page.fill('input[name="email"]', 'designer1@patina.local');
      await page.fill('input[name="password"]', 'password123');
      await page.click('button[type="submit"]');

      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
      console.log('URL after sign-in:', page.url());
    } else {
      console.log('\nStep 3: Already authenticated or no redirect');
    }

    // 4. Check if we reached catalog page
    console.log('\nStep 4: Checking catalog page state...');
    await page.waitForTimeout(2000); // Wait for potential client-side navigation

    const finalUrl = page.url();
    console.log('Final URL:', finalUrl);

    // 5. Take screenshot
    await page.screenshot({ path: '/home/kody/Documents/Code/patina/apps/designer-portal/test-results/catalog-integration-test.png', fullPage: true });
    console.log('Screenshot saved');

    // 6. Check for SessionProvider error
    const bodyText = await page.textContent('body');
    const hasSessionProviderError = bodyText?.includes('SessionProvider') || bodyText?.includes('useSession');

    if (hasSessionProviderError) {
      console.log('\n❌ ERROR: SessionProvider error detected!');
      console.log('Body text snippet:', bodyText?.substring(0, 500));
    } else {
      console.log('\n✅ No SessionProvider error detected');
    }

    // 7. Check for products
    const productElements = await page.locator('[data-testid*="product"], .product-card, [class*="product"]').count();
    console.log('Product elements found:', productElements);

    // 8. Check for catalog UI elements
    const hasSearchBar = await page.locator('input[type="search"], input[placeholder*="Search"]').count() > 0;
    const hasFilterButton = await page.locator('button:has-text("Filter"), button:has-text("Filters")').count() > 0;

    console.log('Has search bar:', hasSearchBar);
    console.log('Has filter button:', hasFilterButton);

    // 9. Get page title
    const title = await page.title();
    console.log('Page title:', title);

    // 10. Summary
    console.log('\n=== INTEGRATION TEST SUMMARY ===');
    console.log('Final URL:', finalUrl);
    console.log('SessionProvider Error:', hasSessionProviderError ? '❌ YES' : '✅ NO');
    console.log('Products Found:', productElements);
    console.log('Search Bar:', hasSearchBar ? '✅ YES' : '❌ NO');
    console.log('Filter Button:', hasFilterButton ? '✅ YES' : '❌ NO');
    console.log('===============================');

    // Assert that we're on a page without SessionProvider errors
    expect(hasSessionProviderError).toBe(false);
  });

  test('should check if catalog API is accessible', async ({ page }) => {
    // Test direct API access
    console.log('Testing catalog API...');

    const response = await page.goto('http://localhost:3011/api/v1/products', {
      waitUntil: 'networkidle',
      timeout: 5000
    }).catch(e => {
      console.log('Catalog API error:', e.message);
      return null;
    });

    if (response) {
      console.log('Catalog API Status:', response.status());
      const text = await response.text();
      console.log('Response preview:', text.substring(0, 200));
    }
  });
});
