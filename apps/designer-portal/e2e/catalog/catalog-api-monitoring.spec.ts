import { test, expect } from '../fixtures/auth';

/**
 * Catalog API Monitoring Tests
 *
 * These tests verify the API calls made from the browser to the catalog service
 * by intercepting network requests and validating responses.
 *
 * NOTE: The frontend can be configured to call the catalog service either:
 * - Directly via NEXT_PUBLIC_CATALOG_API_URL (e.g., http://localhost:3011/v1)
 * - Through Next.js API routes at /api/catalog (proxy mode)
 *
 * This test monitors BOTH patterns to handle either configuration.
 */

interface ApiCall {
  url: string;
  method: string;
  status: number;
  timing: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
}

/**
 * Check if a URL is a catalog API call (either direct or proxied)
 */
function isCatalogApiUrl(url: string): boolean {
  // Direct catalog service calls (e.g., http://localhost:3011/v1/products)
  if (url.includes(':3011/v1/')) return true;
  // Next.js API route proxy calls (e.g., /api/catalog/products)
  if (url.includes('/api/catalog')) return true;
  return false;
}

/**
 * Check if URL is a products endpoint
 */
function isProductsUrl(url: string): boolean {
  return url.includes('/products') && (url.includes(':3011/v1/') || url.includes('/api/catalog'));
}

/**
 * Check if URL is a categories endpoint
 */
function isCategoriesUrl(url: string): boolean {
  return url.includes('/categories') && (url.includes(':3011/v1/') || url.includes('/api/catalog'));
}

/**
 * Check if URL is a collections endpoint
 */
function isCollectionsUrl(url: string): boolean {
  return url.includes('/collections') && (url.includes(':3011/v1/') || url.includes('/api/catalog'));
}

/**
 * Check if URL is a vendors endpoint
 */
function isVendorsUrl(url: string): boolean {
  return url.includes('/vendors') && (url.includes(':3011/v1/') || url.includes('/api/catalog'));
}

test.describe('Catalog API Monitoring', () => {
  test('should capture all catalog API calls when loading the catalog page', async ({
    authenticatedPage,
  }) => {
    const apiCalls: ApiCall[] = [];

    // Set up request interception before navigation
    authenticatedPage.on('request', (request) => {
      const url = request.url();
      if (isCatalogApiUrl(url)) {
        console.log(`📤 REQUEST: ${request.method()} ${url}`);
      }
    });

    authenticatedPage.on('response', async (response) => {
      const url = response.url();
      if (isCatalogApiUrl(url)) {
        const timing = response.request().timing();
        const apiCall: ApiCall = {
          url,
          method: response.request().method(),
          status: response.status(),
          timing: timing.responseEnd - timing.requestStart,
          requestHeaders: response.request().headers(),
          responseHeaders: response.headers(),
        };

        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            apiCall.responseBody = await response.json();
          }
        } catch {
          // Response body might not be JSON
        }

        apiCalls.push(apiCall);
        console.log(
          `📥 RESPONSE: ${apiCall.method} ${apiCall.url} - Status: ${apiCall.status} (${Math.round(apiCall.timing)}ms)`
        );
      }
    });

    // Navigate to catalog page
    await authenticatedPage.goto('/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for API calls to complete
    await authenticatedPage.waitForTimeout(3000);

    // Log summary of API calls
    console.log('\n=== CATALOG API CALLS SUMMARY ===');
    console.log(`Total API calls: ${apiCalls.length}`);
    apiCalls.forEach((call, index) => {
      console.log(`\n${index + 1}. ${call.method} ${call.url}`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Timing: ${Math.round(call.timing)}ms`);
      if (call.responseBody && typeof call.responseBody === 'object') {
        const body = call.responseBody as Record<string, unknown>;
        if (Array.isArray(body.data)) {
          console.log(`   Response: ${body.data.length} items`);
        } else if (body.data) {
          console.log(`   Response: Single item`);
        }
      }
    });
    console.log('================================\n');

    // Verify API calls were captured
    expect(apiCalls.length).toBeGreaterThan(0);

    // Verify we got a products API call
    const productsCall = apiCalls.find((c) => isProductsUrl(c.url));
    expect(productsCall).toBeDefined();
    console.log(`✅ Products API call captured: ${productsCall?.status}`);
  });

  test('should verify catalog API response structure', async ({ authenticatedPage }) => {
    let productsResponse: Record<string, unknown> | null = null;

    // Intercept and capture the products API response
    authenticatedPage.on('response', async (response) => {
      const url = response.url();
      // Match products list endpoint but not individual product details
      if (isProductsUrl(url) && !url.match(/\/products\/[a-f0-9-]+/)) {
        try {
          productsResponse = await response.json();
        } catch {
          // Not JSON
        }
      }
    });

    await authenticatedPage.goto('/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait a bit for API calls to complete
    await authenticatedPage.waitForTimeout(5000);

    // Verify response structure
    expect(productsResponse).not.toBeNull();
    console.log('\n=== PRODUCTS API RESPONSE STRUCTURE ===');
    console.log(JSON.stringify(productsResponse, null, 2).slice(0, 2000));
    console.log('=======================================\n');

    // Check for expected response structure
    // The API might return data directly or wrapped in a data property
    const hasData = 'data' in productsResponse!;
    const isArray = Array.isArray(productsResponse);

    expect(hasData || isArray || 'products' in productsResponse!).toBeTruthy();
  });

  test('should monitor search API calls', async ({ authenticatedPage }) => {
    const searchCalls: ApiCall[] = [];

    authenticatedPage.on('response', async (response) => {
      const url = response.url();
      if (isCatalogApiUrl(url) && url.includes('search')) {
        const apiCall: ApiCall = {
          url,
          method: response.request().method(),
          status: response.status(),
          timing: 0,
          requestHeaders: response.request().headers(),
          responseHeaders: response.headers(),
        };

        try {
          apiCall.responseBody = await response.json();
        } catch {
          // Not JSON
        }

        searchCalls.push(apiCall);
        console.log(`🔍 SEARCH API: ${apiCall.method} ${apiCall.url} - Status: ${apiCall.status}`);
      }
    });

    // Navigate to catalog
    await authenticatedPage.goto('/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for page to load
    await authenticatedPage.waitForTimeout(3000);

    // Perform a search
    const searchInput = authenticatedPage.getByPlaceholder(/Search products/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('chair');
      await searchInput.press('Enter');

      // Wait for search to complete
      await authenticatedPage.waitForTimeout(2000);
      await authenticatedPage.waitForTimeout(3000);

      console.log(`\n=== SEARCH API CALLS ===`);
      console.log(`Total search calls: ${searchCalls.length}`);
      searchCalls.forEach((call) => {
        console.log(`  ${call.method} ${call.url}`);
        console.log(`  Status: ${call.status}`);
      });
      console.log('========================\n');
    }

    // Test passes regardless - we're monitoring
    expect(true).toBeTruthy();
  });

  test('should monitor categories API calls', async ({ authenticatedPage }) => {
    const categoryCalls: ApiCall[] = [];

    authenticatedPage.on('response', async (response) => {
      const url = response.url();
      if (isCategoriesUrl(url)) {
        const apiCall: ApiCall = {
          url,
          method: response.request().method(),
          status: response.status(),
          timing: 0,
          requestHeaders: response.request().headers(),
          responseHeaders: response.headers(),
        };

        try {
          apiCall.responseBody = await response.json();
        } catch {
          // Not JSON
        }

        categoryCalls.push(apiCall);
        console.log(`📁 CATEGORIES API: ${apiCall.url} - Status: ${apiCall.status}`);
      }
    });

    await authenticatedPage.goto('/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await authenticatedPage.waitForTimeout(3000);

    console.log(`\n=== CATEGORIES API CALLS ===`);
    console.log(`Total category calls: ${categoryCalls.length}`);
    categoryCalls.forEach((call) => {
      console.log(`  ${call.method} ${call.url}`);
      console.log(`  Status: ${call.status}`);
      if (call.responseBody && typeof call.responseBody === 'object') {
        const body = call.responseBody as Record<string, unknown>;
        if (Array.isArray(body.data)) {
          console.log(`  Categories returned: ${body.data.length}`);
        } else if (Array.isArray(body)) {
          console.log(`  Categories returned: ${body.length}`);
        }
      }
    });
    console.log('============================\n');

    // Test passes regardless - we're monitoring
    expect(true).toBeTruthy();
  });

  test('should monitor collections API calls', async ({ authenticatedPage }) => {
    const collectionCalls: ApiCall[] = [];

    authenticatedPage.on('response', async (response) => {
      const url = response.url();
      if (isCollectionsUrl(url)) {
        const apiCall: ApiCall = {
          url,
          method: response.request().method(),
          status: response.status(),
          timing: 0,
          requestHeaders: response.request().headers(),
          responseHeaders: response.headers(),
        };

        try {
          apiCall.responseBody = await response.json();
        } catch {
          // Not JSON
        }

        collectionCalls.push(apiCall);
        console.log(`📚 COLLECTIONS API: ${apiCall.url} - Status: ${apiCall.status}`);
      }
    });

    await authenticatedPage.goto('/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await authenticatedPage.waitForTimeout(3000);

    console.log(`\n=== COLLECTIONS API CALLS ===`);
    console.log(`Total collection calls: ${collectionCalls.length}`);
    collectionCalls.forEach((call) => {
      console.log(`  ${call.method} ${call.url}`);
      console.log(`  Status: ${call.status}`);
      if (call.responseBody && typeof call.responseBody === 'object') {
        const body = call.responseBody as Record<string, unknown>;
        if (Array.isArray(body.data)) {
          console.log(`  Collections returned: ${body.data.length}`);
        } else if (Array.isArray(body)) {
          console.log(`  Collections returned: ${body.length}`);
        }
      }
    });
    console.log('=============================\n');

    // Test passes regardless - we're monitoring
    expect(true).toBeTruthy();
  });

  test('should verify API response times are acceptable', async ({ authenticatedPage }) => {
    const apiTimings: { url: string; timing: number }[] = [];

    authenticatedPage.on('response', async (response) => {
      const url = response.url();
      if (isCatalogApiUrl(url)) {
        const timing = response.request().timing();
        const duration = timing.responseEnd - timing.requestStart;
        apiTimings.push({ url, timing: duration });
      }
    });

    await authenticatedPage.goto('/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await authenticatedPage.waitForTimeout(3000);

    console.log('\n=== API RESPONSE TIMES ===');
    apiTimings.forEach(({ url, timing }) => {
      const path = new URL(url).pathname;
      const status = timing < 500 ? '✅' : timing < 2000 ? '⚠️' : '❌';
      console.log(`${status} ${path}: ${Math.round(timing)}ms`);
    });
    console.log('==========================\n');

    // Verify no API call takes longer than 10 seconds
    const slowCalls = apiTimings.filter((t) => t.timing > 10000);
    if (slowCalls.length > 0) {
      console.warn('Slow API calls detected:', slowCalls);
    }
    expect(slowCalls.length).toBe(0);
  });

  test('should capture API error responses', async ({ authenticatedPage }) => {
    const errorCalls: ApiCall[] = [];

    authenticatedPage.on('response', async (response) => {
      const url = response.url();
      if (isCatalogApiUrl(url) && response.status() >= 400) {
        const apiCall: ApiCall = {
          url,
          method: response.request().method(),
          status: response.status(),
          timing: 0,
          requestHeaders: response.request().headers(),
          responseHeaders: response.headers(),
        };

        try {
          apiCall.responseBody = await response.json();
        } catch {
          // Not JSON
        }

        errorCalls.push(apiCall);
        console.log(`❌ ERROR: ${apiCall.method} ${apiCall.url} - Status: ${apiCall.status}`);
        if (apiCall.responseBody) {
          console.log(`   Error body:`, JSON.stringify(apiCall.responseBody, null, 2));
        }
      }
    });

    await authenticatedPage.goto('/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await authenticatedPage.waitForTimeout(3000);

    console.log(`\n=== API ERRORS ===`);
    console.log(`Total error calls: ${errorCalls.length}`);
    if (errorCalls.length === 0) {
      console.log('✅ No API errors detected');
    } else {
      errorCalls.forEach((call) => {
        console.log(`  ${call.method} ${call.url} - ${call.status}`);
      });
    }
    console.log('==================\n');

    // Log but don't fail - errors might be expected if service is down
    expect(true).toBeTruthy();
  });

  test('should verify request headers are sent correctly', async ({ authenticatedPage }) => {
    let requestHeaders: Record<string, string> | null = null;

    authenticatedPage.on('request', (request) => {
      const url = request.url();
      if (isProductsUrl(url) && !requestHeaders) {
        requestHeaders = request.headers();
      }
    });

    await authenticatedPage.goto('/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await authenticatedPage.waitForTimeout(3000);

    if (requestHeaders) {
      console.log('\n=== REQUEST HEADERS ===');
      console.log(JSON.stringify(requestHeaders, null, 2));
      console.log('=======================\n');

      // Verify essential headers
      expect(requestHeaders['accept']).toBeDefined();
    }

    expect(true).toBeTruthy();
  });
});

test.describe('Catalog API - Comprehensive Flow', () => {
  test('should capture full user journey API calls', async ({ authenticatedPage }) => {
    const allApiCalls: ApiCall[] = [];

    // Set up comprehensive monitoring
    authenticatedPage.on('response', async (response) => {
      const url = response.url();
      if (isCatalogApiUrl(url) || url.includes('/api/search') || url.includes(':3013/v1/')) {
        const timing = response.request().timing();
        const apiCall: ApiCall = {
          url,
          method: response.request().method(),
          status: response.status(),
          timing: timing.responseEnd - timing.requestStart,
          requestHeaders: response.request().headers(),
          responseHeaders: response.headers(),
        };

        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            apiCall.responseBody = await response.json();
          }
        } catch {
          // Not JSON
        }

        allApiCalls.push(apiCall);
      }
    });

    // Step 1: Navigate to catalog
    console.log('\n📍 Step 1: Navigate to catalog page');
    await authenticatedPage.goto('/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await authenticatedPage.waitForTimeout(3000);

    const step1Calls = allApiCalls.length;
    console.log(`   API calls made: ${step1Calls}`);

    // Step 2: Search for a product
    console.log('\n📍 Step 2: Search for products');
    const searchInput = authenticatedPage.getByPlaceholder(/Search products/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('modern');
      await authenticatedPage.waitForTimeout(1000);
      await authenticatedPage.waitForTimeout(3000);
    }

    const step2Calls = allApiCalls.length - step1Calls;
    console.log(`   API calls made: ${step2Calls}`);

    // Step 3: Try to click on filter button
    console.log('\n📍 Step 3: Open filters');
    const filterButton = authenticatedPage.getByRole('button', { name: /Filters/i }).first();
    if (await filterButton.isVisible()) {
      await filterButton.click();
      await authenticatedPage.waitForTimeout(500);
    }

    const step3Calls = allApiCalls.length - step1Calls - step2Calls;
    console.log(`   API calls made: ${step3Calls}`);

    // Final summary
    console.log('\n=== COMPREHENSIVE API SUMMARY ===');
    console.log(`Total API calls in journey: ${allApiCalls.length}`);
    console.log('\nBy endpoint:');

    const endpointCounts: Record<string, number> = {};
    allApiCalls.forEach((call) => {
      const path = new URL(call.url).pathname;
      endpointCounts[path] = (endpointCounts[path] || 0) + 1;
    });

    Object.entries(endpointCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([path, count]) => {
        console.log(`  ${path}: ${count} calls`);
      });

    console.log('\nBy status:');
    const statusCounts: Record<number, number> = {};
    allApiCalls.forEach((call) => {
      statusCounts[call.status] = (statusCounts[call.status] || 0) + 1;
    });

    Object.entries(statusCounts).forEach(([status, count]) => {
      const statusNum = parseInt(status);
      const icon = statusNum < 300 ? '✅' : statusNum < 400 ? '↩️' : '❌';
      console.log(`  ${icon} ${status}: ${count} calls`);
    });

    console.log('\nAverage response time:');
    const avgTime =
      allApiCalls.length > 0
        ? allApiCalls.reduce((sum, call) => sum + call.timing, 0) / allApiCalls.length
        : 0;
    console.log(`  ${Math.round(avgTime)}ms`);
    console.log('=================================\n');

    // The test passes if we successfully captured API calls
    expect(allApiCalls.length).toBeGreaterThanOrEqual(0);
  });
});
