import { test, expect, Page } from '@playwright/test';

/**
 * Detailed Error Detection Test Suite
 * Captures and reports all types of errors with detailed logging
 */

interface ErrorCapture {
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
  networkFailures: string[];
  moduleErrors: string[];
  uncaughtExceptions: string[];
}

test.describe('Detailed Error Detection', () => {
  test('Comprehensive error check on homepage', async ({ page }) => {
    const errors: ErrorCapture = {
      consoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      networkFailures: [],
      moduleErrors: [],
      uncaughtExceptions: [],
    };

    // Capture console messages
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        errors.consoleErrors.push(text);

        // Check for specific error types
        if (text.includes('Module not found') ||
            text.includes('Cannot find module') ||
            text.includes('Failed to resolve')) {
          errors.moduleErrors.push(text);
        }
        if (text.includes('Uncaught') || text.includes('Unhandled')) {
          errors.uncaughtExceptions.push(text);
        }
      } else if (msg.type() === 'warning') {
        errors.consoleWarnings.push(text);
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      errors.pageErrors.push(`${error.name}: ${error.message}`);
    });

    // Capture network failures
    page.on('requestfailed', (request) => {
      errors.networkFailures.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Navigate and wait
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Additional wait for any delayed errors
    await page.waitForTimeout(2000);

    // Log all captured errors
    console.log('\n=== DETAILED ERROR REPORT FOR HOMEPAGE ===\n');

    console.log(`Console Errors (${errors.consoleErrors.length}):`);
    errors.consoleErrors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err}`);
    });

    console.log(`\nConsole Warnings (${errors.consoleWarnings.length}):`);
    errors.consoleWarnings.forEach((warn, idx) => {
      console.log(`  ${idx + 1}. ${warn}`);
    });

    console.log(`\nPage Errors (${errors.pageErrors.length}):`);
    errors.pageErrors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err}`);
    });

    console.log(`\nNetwork Failures (${errors.networkFailures.length}):`);
    errors.networkFailures.forEach((fail, idx) => {
      console.log(`  ${idx + 1}. ${fail}`);
    });

    console.log(`\nModule Errors (${errors.moduleErrors.length}):`);
    errors.moduleErrors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err}`);
    });

    console.log(`\nUncaught Exceptions (${errors.uncaughtExceptions.length}):`);
    errors.uncaughtExceptions.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err}`);
    });

    console.log('\n=== END OF ERROR REPORT ===\n');

    // Assertions
    expect(errors.moduleErrors, 'No module resolution errors should be present').toHaveLength(0);
    expect(errors.uncaughtExceptions, 'No uncaught exceptions should be present').toHaveLength(0);
    expect(errors.pageErrors, 'No page errors should be present').toHaveLength(0);
  });

  test('Check signin page for specific errors', async ({ page }) => {
    const errors: ErrorCapture = {
      consoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      networkFailures: [],
      moduleErrors: [],
      uncaughtExceptions: [],
    };

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        errors.consoleErrors.push(text);
        if (text.includes('Module not found') || text.includes('Cannot find module')) {
          errors.moduleErrors.push(text);
        }
      }
    });

    page.on('pageerror', (error) => {
      errors.pageErrors.push(`${error.name}: ${error.message}`);
    });

    await page.goto('/auth/signin');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    console.log('\n=== SIGNIN PAGE ERROR REPORT ===\n');
    console.log(`Console Errors: ${errors.consoleErrors.length}`);
    console.log(`Module Errors: ${errors.moduleErrors.length}`);
    console.log(`Page Errors: ${errors.pageErrors.length}`);

    if (errors.consoleErrors.length > 0) {
      console.log('\nErrors found:');
      errors.consoleErrors.forEach(err => console.log(`  - ${err}`));
    }

    expect(errors.moduleErrors, 'No module errors on signin page').toHaveLength(0);
    expect(errors.pageErrors, 'No page errors on signin page').toHaveLength(0);
  });

  test('Check dashboard redirect and capture errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      errors.push(`Page Error: ${error.message}`);
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

    const finalUrl = page.url();
    console.log(`\n=== DASHBOARD TEST ===`);
    console.log(`Final URL: ${finalUrl}`);
    console.log(`Errors captured: ${errors.length}`);

    if (errors.length > 0) {
      console.log('Errors:');
      errors.forEach(err => console.log(`  - ${err}`));
    }

    // Should redirect to signin
    expect(finalUrl).toContain('/auth/signin');
  });

  test('Test multiple protected routes for consistent behavior', async ({ page }) => {
    const routes = ['/users', '/catalog', '/settings', '/orders', '/media'];
    const results: Record<string, { redirected: boolean; errors: number }> = {};

    for (const route of routes) {
      const errors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      await page.goto(route);
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});

      const finalUrl = page.url();
      results[route] = {
        redirected: finalUrl.includes('/auth/signin'),
        errors: errors.length,
      };

      // Remove all listeners for next iteration
      page.removeAllListeners('console');
    }

    console.log('\n=== PROTECTED ROUTES TEST ===');
    Object.entries(results).forEach(([route, result]) => {
      console.log(`${route}: redirected=${result.redirected}, errors=${result.errors}`);
    });

    // All should redirect
    Object.values(results).forEach(result => {
      expect(result.redirected, 'Protected route should redirect to signin').toBe(true);
    });
  });
});
