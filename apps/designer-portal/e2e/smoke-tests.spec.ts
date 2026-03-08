import { test, expect } from '@playwright/test';

/**
 * Comprehensive Smoke Tests for Designer Portal
 * Tests all critical pages for module resolution, runtime errors, and basic rendering
 */

test.describe('Designer Portal - Comprehensive Smoke Tests', () => {
  const criticalPages = [
    { path: '/', name: 'Homepage/Root', requiresAuth: false },
    { path: '/dashboard', name: 'Main Dashboard', requiresAuth: true },
    { path: '/catalog', name: 'Product Catalog', requiresAuth: true },
    { path: '/clients', name: 'Client Management', requiresAuth: true },
    { path: '/projects', name: 'Project Management', requiresAuth: true },
    { path: '/proposals', name: 'Proposals Page', requiresAuth: true },
    { path: '/messages', name: 'Messaging', requiresAuth: true },
    { path: '/auth/signin', name: 'Sign-in Page', requiresAuth: false },
  ];

  for (const pageInfo of criticalPages) {
    test(`${pageInfo.name} (${pageInfo.path}) - should load without critical errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const networkErrors: { url: string; status: number }[] = [];

      // Capture console errors
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Capture page errors
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      // Capture network errors (500, 404, etc.)
      page.on('response', (response) => {
        if (response.status() >= 400 && response.status() !== 401 && response.status() !== 403) {
          networkErrors.push({
            url: response.url(),
            status: response.status(),
          });
        }
      });

      console.log(`\n=== TESTING: ${pageInfo.name} (${pageInfo.path}) ===`);

      // Navigate to the page
      const response = await page.goto(pageInfo.path);

      // Wait for initial load
      await page.waitForLoadState('domcontentloaded');

      // Get the final URL (after any redirects)
      const finalUrl = page.url();
      console.log(`Final URL: ${finalUrl}`);

      // Check if we were redirected to signin
      const redirectedToSignin = finalUrl.includes('/auth/signin');

      if (pageInfo.requiresAuth && redirectedToSignin) {
        console.log(`✓ Correctly redirected to signin (protected route)`);

        // For protected pages that redirect to signin, verify signin page loads correctly
        await expect(page.locator('body')).not.toBeEmpty();

        // Check for module resolution errors (critical)
        const hasModuleErrors = pageErrors.some(err =>
          err.includes('Module not found') ||
          err.includes("Can't resolve")
        );

        if (hasModuleErrors) {
          console.error('❌ MODULE RESOLUTION ERRORS:');
          pageErrors.forEach(err => console.error(`  - ${err}`));
        }

        expect(hasModuleErrors, `Module resolution errors found on ${pageInfo.name}`).toBe(false);

        // Check response status (500 is critical)
        if (response && response.status() === 500) {
          console.error(`❌ Server returned 500 error`);
          expect(response.status(), `${pageInfo.name} returned 500 error`).not.toBe(500);
        }

      } else if (!pageInfo.requiresAuth && !redirectedToSignin) {
        // Public page should load
        console.log(`✓ Public page loaded without redirect`);

        // Verify page has content
        const bodyText = await page.locator('body').textContent();
        expect(bodyText?.length || 0).toBeGreaterThan(0);

        // Check for module resolution errors
        const hasModuleErrors = pageErrors.some(err =>
          err.includes('Module not found') ||
          err.includes("Can't resolve")
        );

        if (hasModuleErrors) {
          console.error('❌ MODULE RESOLUTION ERRORS:');
          pageErrors.forEach(err => console.error(`  - ${err}`));
        }

        expect(hasModuleErrors, `Module resolution errors found on ${pageInfo.name}`).toBe(false);

        // Check response status
        if (response && response.status() === 500) {
          console.error(`❌ Server returned 500 error`);
          expect(response.status(), `${pageInfo.name} returned 500 error`).not.toBe(500);
        }

      } else {
        console.log(`Page loaded at: ${finalUrl}`);
      }

      // Report all errors found
      if (consoleErrors.length > 0) {
        console.log(`\nConsole Errors (${consoleErrors.length}):`);
        consoleErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err.substring(0, 200)}`));
      }

      if (pageErrors.length > 0) {
        console.log(`\nPage Errors (${pageErrors.length}):`);
        pageErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err.substring(0, 200)}`));
      }

      if (networkErrors.length > 0) {
        console.log(`\nNetwork Errors (${networkErrors.length}):`);
        networkErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err.status} - ${err.url}`));
      }

      // Critical checks that should always pass
      const criticalModuleErrors = pageErrors.filter(err =>
        err.includes('Module not found') || err.includes("Can't resolve")
      );

      expect(criticalModuleErrors.length,
        `CRITICAL: Module resolution errors on ${pageInfo.name}: ${criticalModuleErrors.join(', ')}`
      ).toBe(0);
    });
  }

  test('Additional pages discovery - settings, profile, etc.', async ({ page }) => {
    const additionalPages = [
      '/settings',
      '/profile',
      '/notifications',
      '/help',
      '/analytics',
    ];

    for (const path of additionalPages) {
      console.log(`\nTesting: ${path}`);

      const pageErrors: string[] = [];
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      try {
        const response = await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const finalUrl = page.url();

        console.log(`  ${path} -> ${finalUrl} (${response?.status() || 'N/A'})`);

        // Check for module errors
        const hasModuleErrors = pageErrors.some(err =>
          err.includes('Module not found') || err.includes("Can't resolve")
        );

        if (hasModuleErrors) {
          console.error(`  ❌ Module errors on ${path}`);
          pageErrors.forEach(err => console.error(`    - ${err.substring(0, 100)}`));
        }

      } catch (error) {
        console.log(`  ${path} - Not found or timeout (this may be expected)`);
      }
    }
  });
});
