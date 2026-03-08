import { test, expect } from '../fixtures/auth';

/**
 * Debug test to capture ALL network requests
 */
test('debug: capture all network requests on catalog page', async ({ authenticatedPage }) => {
  const allRequests: { url: string; method: string; resourceType: string }[] = [];
  const allResponses: { url: string; status: number }[] = [];
  const allErrors: { url: string; error: string }[] = [];

  // Capture ALL requests
  authenticatedPage.on('request', (request) => {
    allRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
    });
  });

  // Capture ALL responses
  authenticatedPage.on('response', (response) => {
    allResponses.push({
      url: response.url(),
      status: response.status(),
    });
  });

  // Capture request failures
  authenticatedPage.on('requestfailed', (request) => {
    allErrors.push({
      url: request.url(),
      error: request.failure()?.errorText || 'Unknown error',
    });
  });

  // Also capture console logs/errors from the page
  authenticatedPage.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[CONSOLE ${msg.type().toUpperCase()}]`, msg.text());
    }
  });

  // Navigate to catalog
  await authenticatedPage.goto('/catalog', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Wait for things to settle
  await authenticatedPage.waitForTimeout(5000);

  // Log results
  console.log('\n=== ALL NETWORK REQUESTS ===');
  console.log(`Total requests: ${allRequests.length}`);

  // Filter for API-related requests
  const apiRequests = allRequests.filter(
    (r) =>
      r.url.includes('/api/') ||
      r.url.includes('localhost:3011') ||
      r.resourceType === 'fetch' ||
      r.resourceType === 'xhr'
  );

  console.log('\n--- API/Fetch Requests ---');
  if (apiRequests.length === 0) {
    console.log('⚠️ NO API/FETCH REQUESTS FOUND');
  } else {
    apiRequests.forEach((r) => {
      console.log(`  ${r.method} ${r.url} (${r.resourceType})`);
    });
  }

  console.log('\n--- Catalog-related Requests ---');
  const catalogRequests = allRequests.filter((r) => r.url.includes('catalog'));
  if (catalogRequests.length === 0) {
    console.log('⚠️ NO CATALOG REQUESTS FOUND');
  } else {
    catalogRequests.forEach((r) => {
      console.log(`  ${r.method} ${r.url}`);
    });
  }

  console.log('\n--- Failed Requests ---');
  if (allErrors.length === 0) {
    console.log('✅ No failed requests');
  } else {
    allErrors.forEach((e) => {
      console.log(`  ❌ ${e.url}: ${e.error}`);
    });
  }

  console.log('\n--- API Responses ---');
  const apiResponses = allResponses.filter((r) => r.url.includes('/api/'));
  if (apiResponses.length === 0) {
    console.log('⚠️ NO API RESPONSES');
  } else {
    apiResponses.forEach((r) => {
      const icon = r.status < 300 ? '✅' : r.status < 400 ? '↩️' : '❌';
      console.log(`  ${icon} ${r.status} ${r.url}`);
    });
  }

  // Check if we're seeing mock data indicators
  console.log('\n--- Page State ---');
  const pageContent = await authenticatedPage.content();
  const hasMockIndicator = pageContent.includes('mock') || pageContent.includes('Mock');
  console.log(`Mock indicator in page: ${hasMockIndicator}`);

  // Check for products being rendered
  const productCards = await authenticatedPage.locator('[class*="card"]').count();
  console.log(`Product cards visible: ${productCards}`);

  // Check for error messages
  const errorAlerts = await authenticatedPage.locator('[class*="alert"]').count();
  console.log(`Error alerts visible: ${errorAlerts}`);

  console.log('==============================\n');

  expect(true).toBeTruthy();
});

test('debug: check what URL catalogApi is calling', async ({ authenticatedPage }) => {
  // Inject script to intercept fetch calls
  await authenticatedPage.addInitScript(() => {
    const originalFetch = window.fetch;
    (window as any).__fetchCalls = [];

    window.fetch = async function (...args) {
      const url = args[0]?.toString() || args[0];
      console.log('[FETCH INTERCEPTED]', url);
      (window as any).__fetchCalls.push({ url, time: Date.now() });
      return originalFetch.apply(this, args);
    };
  });

  // Navigate
  await authenticatedPage.goto('/catalog', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await authenticatedPage.waitForTimeout(5000);

  // Get intercepted fetch calls
  const fetchCalls = await authenticatedPage.evaluate(() => (window as any).__fetchCalls || []);

  console.log('\n=== FETCH CALLS FROM BROWSER ===');
  if (fetchCalls.length === 0) {
    console.log('⚠️ NO FETCH CALLS MADE FROM BROWSER');
    console.log('This suggests React Query is using cached/mock data');
  } else {
    fetchCalls.forEach((call: any) => {
      console.log(`  ${call.url}`);
    });
  }
  console.log('=================================\n');

  expect(true).toBeTruthy();
});
