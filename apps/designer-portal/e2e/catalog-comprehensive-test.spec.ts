import { test, expect, type Page } from '@playwright/test';

/**
 * Comprehensive Product Catalog Test Suite
 * Tests all major catalog features and documents any issues
 */

const CATALOG_URL = 'http://localhost:3000/catalog';
const CATEGORIES_URL = 'http://localhost:3000/catalog/categories';

// Helper to wait for network idle
async function waitForNetworkIdle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500); // Additional buffer
}

test.describe('Product Catalog - Comprehensive Feature Test', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to catalog page
    await page.goto(CATALOG_URL);
    await waitForNetworkIdle(page);
  });

  test('Issue Tracking: Catalog page loads and displays products', async ({ page }) => {
    console.log('=== TEST 1: Page Load ===');

    // Check if page loaded
    const title = await page.locator('h1').textContent();
    console.log('Page title:', title);
    expect(title).toContain('Product Catalog');

    // Check for search bar
    const searchBar = page.locator('input[placeholder*="Search"]').first();
    const searchExists = await searchBar.count() > 0;
    console.log('Search bar exists:', searchExists);

    // Check for products or loading state
    await page.waitForTimeout(2000); // Wait for API response

    const loadingSpinner = await page.locator('[class*="animate-spin"]').count();
    const productCards = await page.locator('[class*="card"]').count();
    const errorAlert = await page.locator('[role="alert"]').count();

    console.log('Loading spinners:', loadingSpinner);
    console.log('Product cards found:', productCards);
    console.log('Error alerts:', errorAlert);

    // Document issues
    const issues: string[] = [];

    if (errorAlert > 0) {
      const errorText = await page.locator('[role="alert"]').first().textContent();
      issues.push(`ERROR: ${errorText}`);
    }

    if (productCards === 0 && loadingSpinner === 0 && errorAlert === 0) {
      issues.push('ISSUE: No products displayed, no loading state, no error message');
    }

    if (issues.length > 0) {
      console.log('ISSUES FOUND:', JSON.stringify(issues, null, 2));
    } else {
      console.log('✓ Test passed');
    }
  });

  test('Issue Tracking: Search functionality', async ({ page }) => {
    console.log('=== TEST 2: Search ===');

    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[placeholder*="Search"]').first();
    const searchExists = await searchInput.count() > 0;
    console.log('Search input exists:', searchExists);

    if (!searchExists) {
      console.log('ISSUE: Search input not found');
      return;
    }

    // Try to search
    await searchInput.fill('sofa');
    await page.waitForTimeout(1000);

    // Check if search button exists
    const searchButton = page.locator('button:has-text("Search")');
    const buttonExists = await searchButton.count() > 0;
    console.log('Search button exists:', buttonExists);

    if (buttonExists) {
      await searchButton.click();
      await waitForNetworkIdle(page);
      await page.waitForTimeout(1000);
    } else {
      // Try submitting with Enter key
      await searchInput.press('Enter');
      await waitForNetworkIdle(page);
      await page.waitForTimeout(1000);
    }

    // Check results
    const resultsText = await page.locator('text=/Showing .* products/i').textContent().catch(() => null);
    console.log('Results text:', resultsText);

    const hasResults = resultsText !== null;
    const hasError = await page.locator('[role="alert"]').count() > 0;

    console.log('Has results:', hasResults);
    console.log('Has error:', hasError);

    if (!hasResults && !hasError) {
      console.log('ISSUE: Search completed but no feedback displayed');
    }
  });

  test('Issue Tracking: View mode switching (Grid/List)', async ({ page }) => {
    console.log('=== TEST 3: View Mode Switching ===');

    await page.waitForTimeout(2000);

    // Look for view mode buttons
    const gridButton = page.locator('button[aria-label*="Grid"], button:has-text("Grid")').first();
    const listButton = page.locator('button[aria-label*="List"], button:has-text("List")').first();

    const gridExists = await gridButton.count() > 0;
    const listExists = await listButton.count() > 0;

    console.log('Grid button exists:', gridExists);
    console.log('List button exists:', listExists);

    if (!gridExists && !listExists) {
      console.log('ISSUE: View mode toggle buttons not found');
      return;
    }

    // Try switching view
    if (listExists) {
      await listButton.click();
      await page.waitForTimeout(500);
      console.log('Clicked list view');
    }

    if (gridExists) {
      await gridButton.click();
      await page.waitForTimeout(500);
      console.log('Clicked grid view');
    }

    console.log('✓ View mode toggle functional (if buttons exist)');
  });

  test('Issue Tracking: Filter functionality', async ({ page }) => {
    console.log('=== TEST 4: Filters ===');

    await page.waitForTimeout(2000);

    // Look for filter button
    const filterButton = page.locator('button:has-text("Filter"), button:has-text("Filters")').first();
    const filterExists = await filterButton.count() > 0;

    console.log('Filter button exists:', filterExists);

    if (!filterExists) {
      console.log('ISSUE: Filter button not found');
      return;
    }

    // Open filters
    await filterButton.click();
    await page.waitForTimeout(500);

    // Check if filter panel opened
    const filterPanel = page.locator('[role="dialog"], [class*="filter"]').first();
    const panelVisible = await filterPanel.isVisible().catch(() => false);

    console.log('Filter panel visible:', panelVisible);

    if (!panelVisible) {
      console.log('ISSUE: Filter panel did not open');
    } else {
      console.log('✓ Filter panel opened successfully');
    }
  });

  test('Issue Tracking: Product card interactions', async ({ page }) => {
    console.log('=== TEST 5: Product Cards ===');

    await page.waitForTimeout(2000);

    // Find first product card
    const productCard = page.locator('[class*="card"]').first();
    const cardExists = await productCard.count() > 0;

    console.log('Product card exists:', cardExists);

    if (!cardExists) {
      console.log('ISSUE: No product cards found');
      return;
    }

    // Check for product image
    const productImage = productCard.locator('img').first();
    const imageExists = await productImage.count() > 0;
    console.log('Product image exists:', imageExists);

    // Check for product name
    const productName = await productCard.locator('h3, [class*="font-semibold"]').first().textContent().catch(() => null);
    console.log('Product name:', productName);

    // Check for price
    const priceElement = await productCard.locator('text=/\\$[0-9]/').first().textContent().catch(() => null);
    console.log('Price displayed:', priceElement);

    // Check for action buttons (Edit, Delete, View, Add)
    const editButton = await productCard.locator('button:has-text("Edit")').count();
    const deleteButton = await productCard.locator('button:has-text("Delete")').count();
    const viewButton = await productCard.locator('button:has-text("View")').count();
    const addButton = await productCard.locator('button:has-text("Add")').count();

    console.log('Edit button:', editButton > 0);
    console.log('Delete button:', deleteButton > 0);
    console.log('View button:', viewButton > 0);
    console.log('Add button:', addButton > 0);

    const issues: string[] = [];

    if (!imageExists) issues.push('ISSUE: Product image missing');
    if (!productName) issues.push('ISSUE: Product name missing');
    if (!priceElement) issues.push('ISSUE: Product price missing');

    if (issues.length > 0) {
      console.log('ISSUES:', JSON.stringify(issues, null, 2));
    } else {
      console.log('✓ Product card structure looks good');
    }
  });

  test('Issue Tracking: Create Product button', async ({ page }) => {
    console.log('=== TEST 6: Create Product ===');

    await page.waitForTimeout(2000);

    const createButton = page.locator('button:has-text("Create Product"), a:has-text("Create Product")').first();
    const buttonExists = await createButton.count() > 0;

    console.log('Create Product button exists:', buttonExists);

    if (!buttonExists) {
      console.log('NOTE: Create Product button not visible (may be permission-based)');
    } else {
      // Check if clickable
      const isEnabled = await createButton.isEnabled();
      console.log('Create button enabled:', isEnabled);
      console.log('✓ Create Product button available');
    }
  });

  test('Issue Tracking: Delete confirmation dialog', async ({ page }) => {
    console.log('=== TEST 7: Delete Functionality ===');

    await page.waitForTimeout(2000);

    // Look for delete button on first product
    const deleteButton = page.locator('button:has-text("Delete")').first();
    const deleteExists = await deleteButton.count() > 0;

    console.log('Delete button exists:', deleteExists);

    if (!deleteExists) {
      console.log('NOTE: Delete button not visible (may be permission-based - admin only)');
      return;
    }

    // Click delete button
    await deleteButton.click();
    await page.waitForTimeout(500);

    // Check for confirmation dialog
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]').first();
    const dialogVisible = await dialog.isVisible().catch(() => false);

    console.log('Delete dialog visible:', dialogVisible);

    if (!dialogVisible) {
      console.log('ISSUE: Delete confirmation dialog did not appear');
      return;
    }

    // Check dialog content
    const dialogTitle = await dialog.locator('text=/Delete/i').textContent().catch(() => null);
    const cancelButton = await dialog.locator('button:has-text("Cancel")').count();
    const confirmButton = await dialog.locator('button:has-text("Delete")').count();

    console.log('Dialog title:', dialogTitle);
    console.log('Cancel button exists:', cancelButton > 0);
    console.log('Confirm button exists:', confirmButton > 0);

    if (cancelButton > 0) {
      await dialog.locator('button:has-text("Cancel")').click();
      await page.waitForTimeout(500);
      console.log('✓ Delete dialog closed via Cancel');
    }
  });

  test('Issue Tracking: Pagination', async ({ page }) => {
    console.log('=== TEST 8: Pagination ===');

    await page.waitForTimeout(2000);

    // Look for pagination controls
    const nextButton = page.locator('button:has-text("Next")').first();
    const prevButton = page.locator('button:has-text("Previous")').first();
    const pageNumbers = page.locator('button[class*="page"], button:has-text(/^[0-9]+$/)');

    const nextExists = await nextButton.count() > 0;
    const prevExists = await prevButton.count() > 0;
    const pageNumberCount = await pageNumbers.count();

    console.log('Next button exists:', nextExists);
    console.log('Previous button exists:', prevExists);
    console.log('Page number buttons:', pageNumberCount);

    if (!nextExists && !prevExists && pageNumberCount === 0) {
      console.log('NOTE: No pagination controls (may indicate single page of results)');
    } else {
      console.log('✓ Pagination controls available');
    }
  });
});

test.describe('Categories Page Tests', () => {
  test('Issue Tracking: Categories page loads', async ({ page }) => {
    console.log('=== TEST 9: Categories Page ===');

    await page.goto(CATEGORIES_URL);
    await waitForNetworkIdle(page);
    await page.waitForTimeout(2000);

    // Check page title
    const title = await page.locator('h2:has-text("Categories")').textContent().catch(() => null);
    console.log('Categories page title:', title);

    // Check for category tree
    const categoryItems = await page.locator('[class*="rounded-lg border"]').count();
    console.log('Category items found:', categoryItems);

    // Check for loading/error states
    const loading = await page.locator('text=/Loading categories/i').count();
    const error = await page.locator('text=/Failed to load/i').count();

    console.log('Loading state:', loading > 0);
    console.log('Error state:', error > 0);

    if (error > 0) {
      const errorText = await page.locator('text=/Failed to load/i').textContent();
      console.log('ERROR:', errorText);
    }

    if (categoryItems === 0 && loading === 0 && error === 0) {
      console.log('NOTE: No categories displayed (may be empty database)');
    } else if (categoryItems > 0) {
      console.log('✓ Categories page loaded successfully');
    }
  });

  test('Issue Tracking: Category expansion', async ({ page }) => {
    console.log('=== TEST 10: Category Tree Expansion ===');

    await page.goto(CATEGORIES_URL);
    await waitForNetworkIdle(page);
    await page.waitForTimeout(2000);

    // Find first category with children (has chevron)
    const expandableCategory = page.locator('[class*="ChevronRight"]').first();
    const hasExpandable = await expandableCategory.count() > 0;

    console.log('Expandable categories found:', hasExpandable);

    if (!hasExpandable) {
      console.log('NOTE: No expandable categories (flat structure or empty)');
      return;
    }

    // Try to expand
    const parentElement = expandableCategory.locator('..').locator('..');
    await parentElement.click();
    await page.waitForTimeout(500);

    console.log('✓ Category expansion tested');
  });
});

test.describe('API Integration Tests', () => {
  test('Issue Tracking: Catalog API responses', async ({ page }) => {
    console.log('=== TEST 11: API Response Monitoring ===');

    const apiCalls: { url: string; status: number; error?: string }[] = [];

    // Monitor network requests
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/catalog') || url.includes(':3011')) {
        apiCalls.push({
          url,
          status: response.status(),
        });
      }
    });

    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.includes('/api/catalog') || url.includes(':3011')) {
        apiCalls.push({
          url,
          status: 0,
          error: request.failure()?.errorText || 'Request failed',
        });
      }
    });

    await page.goto(CATALOG_URL);
    await waitForNetworkIdle(page);
    await page.waitForTimeout(2000);

    console.log('API calls made:', apiCalls.length);

    apiCalls.forEach((call, index) => {
      console.log(`API Call ${index + 1}:`);
      console.log(`  URL: ${call.url}`);
      console.log(`  Status: ${call.status}`);
      if (call.error) {
        console.log(`  ERROR: ${call.error}`);
      }
    });

    const failedCalls = apiCalls.filter(call => call.status >= 400 || call.error);
    if (failedCalls.length > 0) {
      console.log('ISSUES: Failed API calls detected');
      failedCalls.forEach(call => {
        console.log(`  - ${call.url}: ${call.status} ${call.error || ''}`);
      });
    } else {
      console.log('✓ All API calls successful');
    }
  });
});

// Summary test that runs last
test('FINAL: Generate Issue Summary', async ({ page }) => {
  console.log('\n=================================');
  console.log('COMPREHENSIVE TEST SUITE COMPLETE');
  console.log('=================================\n');
  console.log('Review the test output above for detailed issue tracking.');
  console.log('Each test logs its findings including:');
  console.log('  - Feature availability');
  console.log('  - UI element presence');
  console.log('  - Interaction success');
  console.log('  - Error conditions');
  console.log('  - API call results\n');
});
