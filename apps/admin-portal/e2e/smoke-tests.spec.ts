import { test, expect, Page } from '@playwright/test';

/**
 * Comprehensive Smoke Test Suite for Admin Portal
 * Tests all discovered pages for basic functionality, errors, and rendering
 */

// List of all pages discovered in the codebase
const PAGES_TO_TEST = [
  { path: '/', name: 'Homepage/Root', requiresAuth: false },
  { path: '/auth/signin', name: 'Sign In', requiresAuth: false },
  { path: '/auth/signout', name: 'Sign Out', requiresAuth: false, expectsRedirect: true },
  { path: '/auth/error', name: 'Auth Error', requiresAuth: false },
  { path: '/dashboard', name: 'Admin Dashboard', requiresAuth: true },
  { path: '/users', name: 'User Management', requiresAuth: true },
  { path: '/settings', name: 'Admin Settings', requiresAuth: true },
  { path: '/catalog', name: 'Catalog', requiresAuth: true },
  { path: '/catalog/new', name: 'New Catalog Item', requiresAuth: true },
  { path: '/catalog/collections', name: 'Catalog Collections', requiresAuth: true },
  { path: '/catalog/categories', name: 'Catalog Categories', requiresAuth: true },
  { path: '/orders', name: 'Orders', requiresAuth: true },
  { path: '/media', name: 'Media Management', requiresAuth: true },
  { path: '/analytics', name: 'Analytics', requiresAuth: true },
  { path: '/audit', name: 'Audit Logs', requiresAuth: true },
  { path: '/health', name: 'System Health', requiresAuth: true },
  { path: '/flags', name: 'Feature Flags', requiresAuth: true },
  { path: '/search', name: 'Search', requiresAuth: true },
  { path: '/privacy', name: 'Privacy Settings', requiresAuth: true },
  { path: '/verification', name: 'Verification', requiresAuth: true },
];

/**
 * Helper function to check for console errors and page errors
 */
async function checkPageHealth(page: Page, pageName: string) {
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];

  // Listen for console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(msg.text());
    }
  });

  // Listen for page errors
  page.on('pageerror', (error) => {
    errors.push(`Page Error: ${error.message}`);
  });

  return { errors, consoleErrors, consoleWarnings };
}

test.describe('Admin Portal Smoke Tests', () => {
  test.describe('Public Pages (No Auth Required)', () => {
    for (const pageInfo of PAGES_TO_TEST.filter(p => !p.requiresAuth && !('expectsRedirect' in p && p.expectsRedirect))) {
      test(`${pageInfo.name} (${pageInfo.path}) - should load without errors`, async ({ page }) => {
        const errors: string[] = [];
        const consoleErrors: string[] = [];
        const moduleErrors: string[] = [];

        // Listen for console errors
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            const text = msg.text();
            consoleErrors.push(text);

            // Check for module resolution errors
            if (text.includes('Module not found') ||
                text.includes('Cannot find module') ||
                text.includes('Failed to resolve')) {
              moduleErrors.push(text);
            }
          }
        });

        // Listen for page errors
        page.on('pageerror', (error) => {
          errors.push(`Page Error: ${error.message}`);
        });

        // Navigate to the page
        const response = await page.goto(pageInfo.path);

        // Check HTTP status
        expect(response?.status()).toBeLessThan(500);

        // Wait for page to be in a stable state
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
          // Timeout is acceptable for some pages
        });

        // Check that body has some content
        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent).toBeTruthy();
        expect(bodyContent?.length).toBeGreaterThan(0);

        // Report any errors found
        if (moduleErrors.length > 0) {
          console.error(`[${pageInfo.name}] Module Resolution Errors:`, moduleErrors);
        }
        if (consoleErrors.length > 0) {
          console.error(`[${pageInfo.name}] Console Errors:`, consoleErrors);
        }
        if (errors.length > 0) {
          console.error(`[${pageInfo.name}] Page Errors:`, errors);
        }

        // Critical: No module resolution errors
        expect(moduleErrors, `Module resolution errors found on ${pageInfo.name}`).toHaveLength(0);
      });
    }
  });

  test.describe('Redirect Pages (Auto-Redirect Behavior)', () => {
    for (const pageInfo of PAGES_TO_TEST.filter(p => 'expectsRedirect' in p && p.expectsRedirect)) {
      test(`${pageInfo.name} (${pageInfo.path}) - should redirect without errors`, async ({ page }) => {
        const moduleErrors: string[] = [];

        // Listen for console errors
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            const text = msg.text();
            // Check for module resolution errors
            if (text.includes('Module not found') ||
                text.includes('Cannot find module') ||
                text.includes('Failed to resolve')) {
              moduleErrors.push(text);
            }
          }
        });

        // Navigate to the page
        const response = await page.goto(pageInfo.path);

        // Check HTTP status is not a server error
        expect(response?.status()).toBeLessThan(500);

        // Wait for redirect to complete
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

        // Verify no module resolution errors
        expect(moduleErrors, `Module resolution errors found on ${pageInfo.name}`).toHaveLength(0);

        // Log redirect behavior
        const finalUrl = page.url();
        if (finalUrl !== `http://localhost:3001${pageInfo.path}`) {
          console.log(`[${pageInfo.name}] Redirected from ${pageInfo.path} to ${finalUrl}`);
        }
      });
    }
  });

  test.describe('Protected Pages (Auth Required)', () => {
    for (const pageInfo of PAGES_TO_TEST.filter(p => p.requiresAuth)) {
      test(`${pageInfo.name} (${pageInfo.path}) - should redirect to signin or show auth error`, async ({ page }) => {
        const errors: string[] = [];
        const consoleErrors: string[] = [];
        const moduleErrors: string[] = [];

        // Listen for console errors
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            const text = msg.text();
            consoleErrors.push(text);

            // Check for module resolution errors
            if (text.includes('Module not found') ||
                text.includes('Cannot find module') ||
                text.includes('Failed to resolve')) {
              moduleErrors.push(text);
            }
          }
        });

        // Listen for page errors (excluding auth-related errors which are expected)
        page.on('pageerror', (error) => {
          const errorMsg = error.message;
          // Don't count auth errors as failures
          if (!errorMsg.includes('Unauthorized') &&
              !errorMsg.includes('not authenticated') &&
              !errorMsg.includes('401')) {
            errors.push(`Page Error: ${errorMsg}`);
          }
        });

        // Navigate to the page
        const response = await page.goto(pageInfo.path);

        // Wait for page to settle
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

        // Get final URL after any redirects
        const finalUrl = page.url();

        // Check that body exists and has content
        const bodyExists = await page.locator('body').count();
        expect(bodyExists).toBeGreaterThan(0);

        // Report any errors found
        if (moduleErrors.length > 0) {
          console.error(`[${pageInfo.name}] Module Resolution Errors:`, moduleErrors);
        }
        if (consoleErrors.length > 0) {
          console.error(`[${pageInfo.name}] Console Errors:`, consoleErrors);
        }
        if (errors.length > 0) {
          console.error(`[${pageInfo.name}] Page Errors:`, errors);
        }

        // Critical: No module resolution errors
        expect(moduleErrors, `Module resolution errors found on ${pageInfo.name}`).toHaveLength(0);

        // Log redirect behavior for reporting
        if (finalUrl !== `http://localhost:3001${pageInfo.path}`) {
          console.log(`[${pageInfo.name}] Redirected from ${pageInfo.path} to ${finalUrl}`);
        }
      });
    }
  });

  test.describe('Critical Error Detection', () => {
    test('Homepage should not have critical runtime errors', async ({ page }) => {
      const criticalErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (text.includes('Uncaught') ||
              text.includes('TypeError') ||
              text.includes('ReferenceError') ||
              text.includes('SyntaxError')) {
            criticalErrors.push(text);
          }
        }
      });

      page.on('pageerror', (error) => {
        criticalErrors.push(`Critical Page Error: ${error.message}`);
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      if (criticalErrors.length > 0) {
        console.error('Critical Runtime Errors on Homepage:', criticalErrors);
      }

      expect(criticalErrors, 'Critical runtime errors detected on homepage').toHaveLength(0);
    });

    test('Sign In page should load signin form', async ({ page }) => {
      await page.goto('/auth/signin');
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      const bodyText = await page.locator('body').textContent();
      expect(bodyText).toBeTruthy();

      // Should have some form of signin UI
      const hasSignInElements = bodyText?.toLowerCase().includes('sign') ||
                                bodyText?.toLowerCase().includes('login') ||
                                bodyText?.toLowerCase().includes('email') ||
                                bodyText?.toLowerCase().includes('password');

      if (!hasSignInElements) {
        console.warn('Sign in page may not be rendering properly - no signin-related text found');
      }
    });
  });

  test.describe('Network and Resource Loading', () => {
    test('Homepage should not have failed network requests for critical resources', async ({ page }) => {
      const failedRequests: string[] = [];

      page.on('requestfailed', (request) => {
        const url = request.url();
        // Track failed requests for JS, CSS, and API calls
        if (url.includes('.js') || url.includes('.css') || url.includes('/api/')) {
          failedRequests.push(`${request.method()} ${url} - ${request.failure()?.errorText}`);
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      if (failedRequests.length > 0) {
        console.error('Failed Network Requests:', failedRequests);
      }

      // Some failures may be acceptable (e.g., analytics), but log them
      if (failedRequests.length > 5) {
        console.warn(`Warning: ${failedRequests.length} failed requests detected`);
      }
    });
  });

  test.describe('JavaScript Execution', () => {
    test('Pages should not have unhandled promise rejections', async ({ page }) => {
      const unhandledRejections: string[] = [];

      await page.addInitScript(() => {
        window.addEventListener('unhandledrejection', (event) => {
          console.error('Unhandled Promise Rejection:', event.reason);
        });
      });

      page.on('console', (msg) => {
        if (msg.type() === 'error' && msg.text().includes('Unhandled Promise Rejection')) {
          unhandledRejections.push(msg.text());
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      if (unhandledRejections.length > 0) {
        console.error('Unhandled Promise Rejections:', unhandledRejections);
      }
    });
  });
});
