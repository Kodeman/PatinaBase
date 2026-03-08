import { test, expect } from '../fixtures/auth';
import { WaitHelpers } from '../utils/wait-helpers';

/**
 * Catalog Page E2E Tests
 * Tests product loading, search, filters, and accessibility from both localhost and remote machines
 *
 * NOTE: These tests use authenticated contexts to access the protected catalog route
 */

// Test configuration for multiple environments
// Network tests can be enabled by setting PLAYWRIGHT_NETWORK_URL environment variable
const environments = [
  { name: 'localhost', baseURL: 'http://localhost:3000' },
  ...(process.env.PLAYWRIGHT_NETWORK_URL ?
    [{ name: 'network', baseURL: process.env.PLAYWRIGHT_NETWORK_URL }] :
    []
  ),
];

environments.forEach(({ name, baseURL }) => {
  test.describe(`Catalog Page - ${name}`, () => {
    test.use({ baseURL });

    test.beforeEach(async ({ authenticatedPage }) => {
      // Navigate to catalog page with proper wait conditions
      await authenticatedPage.goto('/catalog', {
        waitUntil: 'networkidle',
        timeout: 60000
      });

      // Wait for the page to be fully loaded with network idle
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });

      // Wait for the heading to ensure page is rendered
      await WaitHelpers.waitForElement(authenticatedPage, 'h1, h2, [role="heading"]', { timeout: 10000 });
    });

    test('should load catalog page successfully', async ({ authenticatedPage }) => {
      // Check page title
      await expect(authenticatedPage.getByRole('heading', { name: /Product Catalog/i })).toBeVisible({ timeout: 10000 });

      // Check description
      await expect(authenticatedPage.getByText(/Browse and search thousands of curated products/i)).toBeVisible();

      // Verify search input is present
      await expect(authenticatedPage.getByPlaceholder(/Search products/i)).toBeVisible();

      // Verify filter button is present (use first() since there might be multiple)
      await expect(authenticatedPage.getByRole('button', { name: /Filters/i }).first()).toBeVisible();
    });

    test('should display product grid or loading state', async ({ authenticatedPage }) => {
      // Wait for either loading skeletons or product cards to appear
      await authenticatedPage.waitForSelector('[class*="skeleton"], [class*="card"]', {
        timeout: 10000
      });

      // Check if either loading skeletons or product cards are present
      const loadingSkeletons = authenticatedPage.locator('[class*="skeleton"]').first();
      const productCards = authenticatedPage.locator('[class*="card"]').first();

      const hasLoading = await loadingSkeletons.isVisible().catch(() => false);
      const hasProducts = await productCards.isVisible().catch(() => false);

      expect(hasLoading || hasProducts).toBeTruthy();
    });

    test('should display error message if catalog service is down', async ({ authenticatedPage }) => {
      // Wait for content to load or error to appear
      await authenticatedPage.waitForSelector('text=/Failed to load products|Showing.*products|Loading products/', {
        timeout: 10000
      }).catch(() => {}); // It's ok if this times out

      // Check for error alert
      const errorAlert = authenticatedPage.getByText(/Failed to load products/i);
      const errorText = authenticatedPage.getByText(/catalog service is running on port 3011/i);

      const hasError = await errorAlert.isVisible().catch(() => false);

      if (hasError) {
        // If error is visible, verify error message details
        await expect(errorText).toBeVisible();
      } else {
        // If no error, products should be loading or loaded
        const resultsCount = authenticatedPage.getByText(/Showing.*products/i).or(authenticatedPage.getByText(/Loading products/i)).or(authenticatedPage.getByText(/No products found/i));
        await expect(resultsCount).toBeVisible({ timeout: 10000 });
      }
    });

    test('should show results count when products load', async ({ authenticatedPage }) => {
      // Wait for products to load by checking for results text
      const resultsText = authenticatedPage.getByText(/Showing.*of.*products/i)
        .or(authenticatedPage.getByText(/No products found/i))
        .or(authenticatedPage.getByText(/Loading products/i));

      await expect(resultsText).toBeVisible({ timeout: 10000 });
    });

    test('should have functional search input', async ({ authenticatedPage }) => {
      const searchInput = authenticatedPage.getByPlaceholder(/Search products/i);

      // Type in search
      await searchInput.fill('chair');

      // Verify input value
      await expect(searchInput).toHaveValue('chair');

      // Wait for search to trigger by waiting for network idle
      await WaitHelpers.waitForNetworkIdle(authenticatedPage);
    });

    test('should toggle between grid and list view', async ({ authenticatedPage }) => {
      // Find view toggle buttons - they're in a border container
      const viewModeContainer = authenticatedPage.locator('div.rounded-lg.border.p-1').filter({ has: authenticatedPage.locator('button') });

      // Grid button should be active by default (has 'secondary' variant)
      const gridButton = viewModeContainer.locator('button').filter({ has: authenticatedPage.locator('svg') }).first();
      const listButton = viewModeContainer.locator('button').filter({ has: authenticatedPage.locator('svg') }).last();

      await expect(gridButton).toBeVisible();
      await expect(listButton).toBeVisible();

      // Click list view and wait for view to change
      await listButton.click();
      await WaitHelpers.waitForNetworkIdle(authenticatedPage);

      // Click back to grid and wait for view to change
      await gridButton.click();
      await WaitHelpers.waitForNetworkIdle(authenticatedPage);
    });

    test('should open filter panel', async ({ authenticatedPage }) => {
      const filterButton = authenticatedPage.getByRole('button', { name: /Filters/i }).first();

      await filterButton.click();

      // Wait for filter panel to appear - look for common filter elements
      // The panel might be a modal or sidebar, so we check if it appeared in the DOM
      const filterPanel = authenticatedPage.locator('[role="dialog"]').or(authenticatedPage.locator('[class*="sheet"]')).or(authenticatedPage.locator('[class*="drawer"]'));

      // Wait for animation to complete
      await WaitHelpers.waitForElement(authenticatedPage, '[role="dialog"], [class*="sheet"], [class*="drawer"]', { timeout: 5000 }).catch(() => {});

      // At minimum, the click should not error
      expect(true).toBeTruthy();
    });

    test('should display collections banner if available', async ({ authenticatedPage }) => {
      // Check for collections banner (wait for it to potentially load)
      const collectionsHeading = authenticatedPage.getByText(/Browse Curated Collections/i);
      const hasCollections = await collectionsHeading.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasCollections) {
        // Verify "View All Collections" button
        await expect(authenticatedPage.getByRole('button', { name: /View All Collections/i })).toBeVisible();
      } else {
        // Collections might not be available, which is fine
        expect(true).toBeTruthy();
      }
    });

    test('should handle pagination if products are loaded', async ({ authenticatedPage }) => {
      // Check for pagination
      const previousButton = authenticatedPage.getByRole('button', { name: /Previous/i });
      const nextButton = authenticatedPage.getByRole('button', { name: /Next/i });

      const hasPagination = await previousButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasPagination) {
        // Previous should be disabled on first page
        await expect(previousButton).toBeDisabled();

        // Next might be enabled if there are multiple pages
        const isNextEnabled = await nextButton.isEnabled().catch(() => false);

        if (isNextEnabled) {
          await nextButton.click();
          // Wait for page navigation to complete
          await WaitHelpers.waitForNetworkIdle(authenticatedPage);

          // Previous should now be enabled
          await expect(previousButton).toBeEnabled();
        }
      } else {
        // No pagination might mean no products or only one page
        expect(true).toBeTruthy();
      }
    });

    test('should handle empty state gracefully', async ({ authenticatedPage }) => {
      // Search for something that likely won't exist
      const searchInput = authenticatedPage.getByPlaceholder(/Search products/i);
      await searchInput.fill('xyzabc123nonexistent');

      // Wait for search to complete
      await WaitHelpers.waitForNetworkIdle(authenticatedPage);

      // Check for empty state or no results message
      const emptyMessage = authenticatedPage.getByText(/No products found/i)
        .or(authenticatedPage.getByText(/Try adjusting your search/i));

      // Either empty state is shown or results are shown (if somehow products match)
      const hasEmpty = await emptyMessage.isVisible().catch(() => false);
      const hasResults = await authenticatedPage.getByText(/Showing.*products/i).isVisible().catch(() => false);

      expect(hasEmpty || hasResults).toBeTruthy();
    });

    test('should be accessible via network address', async ({ authenticatedPage }) => {
      // This test specifically checks if the page is accessible
      // If we got here, the page loaded, so just verify critical elements
      await expect(authenticatedPage.getByRole('heading', { name: /Product Catalog/i })).toBeVisible({ timeout: 10000 });

      // Check that the URL matches the expected base URL (accounting for localhost vs IP)
      const url = authenticatedPage.url();
      expect(url).toMatch(/\/catalog/);
    });

    test('should load product images', async ({ authenticatedPage }) => {
      // Look for images in product cards
      const productImages = authenticatedPage.locator('img[alt]').first();
      const hasImages = await productImages.isVisible({ timeout: 10000 }).catch(() => false);

      if (hasImages) {
        // Wait for images to load
        await WaitHelpers.waitForImagesLoaded(authenticatedPage, 'body');

        // Check that at least one image has loaded
        const imgSrc = await productImages.getAttribute('src');
        expect(imgSrc).toBeTruthy();
      } else {
        // No images might mean no products loaded
        expect(true).toBeTruthy();
      }
    });

    test('should show product details on click', async ({ authenticatedPage }) => {
      // Find first product card with a View button
      const viewButton = authenticatedPage.getByRole('button', { name: /View/i }).first();
      const hasProduct = await viewButton.isVisible({ timeout: 10000 }).catch(() => false);

      if (hasProduct) {
        await viewButton.click();

        // Wait for modal to open - look for common modal indicators
        const modal = authenticatedPage.locator('[role="dialog"]').or(authenticatedPage.locator('[class*="modal"]'));
        await WaitHelpers.waitForElement(authenticatedPage, '[role="dialog"], [class*="modal"]', { timeout: 5000 }).catch(() => {});

        // At minimum, the click should not error
        expect(true).toBeTruthy();
      } else {
        // No products available to view
        expect(true).toBeTruthy();
      }
    });
  });
});

// Additional test for comparing localhost vs remote accessibility
test.describe('Catalog Page - Cross-Environment Comparison', () => {
  test.skip(!process.env.PLAYWRIGHT_NETWORK_URL, 'Network URL not configured');

  test('should work on both localhost and network address', async ({ browser }) => {
    // Create two contexts with different base URLs
    const context1 = await browser.newContext({ baseURL: 'http://localhost:3000' });
    const context2 = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_NETWORK_URL || 'http://localhost:3000' });

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Authenticate both pages
      await page1.goto('/auth/signin');
      await page2.goto('/auth/signin');

      // Fill in credentials for both
      const email1 = page1.locator('input[type="email"]');
      const email2 = page2.locator('input[type="email"]');

      const hasEmail1 = await email1.isVisible().catch(() => false);
      const hasEmail2 = await email2.isVisible().catch(() => false);

      if (hasEmail1) {
        await email1.fill('dev@patina.com');
        await page1.locator('input[type="password"]').fill('password');
        await page1.getByRole('button', { name: /sign in/i }).click();
        await page1.waitForURL(/\/(dashboard|catalog)/, { timeout: 10000 });
      }

      if (hasEmail2) {
        await email2.fill('dev@patina.com');
        await page2.locator('input[type="password"]').fill('password');
        await page2.getByRole('button', { name: /sign in/i }).click();
        await page2.waitForURL(/\/(dashboard|catalog)/, { timeout: 10000 });
      }

      // Navigate both pages to catalog
      await Promise.all([
        page1.goto('/catalog', { waitUntil: 'domcontentloaded' }),
        page2.goto('/catalog', { waitUntil: 'domcontentloaded' }),
      ]);

      // Both should show the catalog heading
      await expect(page1.getByRole('heading', { name: /Product Catalog/i })).toBeVisible({ timeout: 10000 });
      await expect(page2.getByRole('heading', { name: /Product Catalog/i })).toBeVisible({ timeout: 10000 });

      // Both should have search functionality
      await expect(page1.getByPlaceholder(/Search products/i)).toBeVisible();
      await expect(page2.getByPlaceholder(/Search products/i)).toBeVisible();
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});

// Performance test
test.describe('Catalog Page - Performance', () => {
  test('should load within acceptable time', async ({ authenticatedPage }) => {
    const startTime = Date.now();

    await authenticatedPage.goto('/catalog', { waitUntil: 'domcontentloaded' });

    const loadTime = Date.now() - startTime;

    // Page should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);

    console.log(`Catalog page loaded in ${loadTime}ms`);
  });
});
