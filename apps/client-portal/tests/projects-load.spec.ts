/**
 * Client Portal - Projects Page Load Test
 * Verifies the projects page loads without errors after the auth/serialization fixes
 */

import { test, expect } from '@playwright/test';

test.describe('Client Portal - Projects Page Load', () => {
  test('should load projects page without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const networkErrors: string[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Capture page errors (uncaught exceptions)
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    // Capture failed network requests
    page.on('requestfailed', (request) => {
      networkErrors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
    });

    // Navigate to projects page
    await page.goto('/projects');

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Take screenshot for verification
    await page.screenshot({ path: 'test-results/projects-page.png', fullPage: true });

    // Check page has content
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(0);

    // Verify no "Unable to load projects" error message
    const errorMessage = page.locator('text=Unable to load projects');
    const hasError = await errorMessage.isVisible().catch(() => false);
    expect(hasError, 'Should not show "Unable to load projects" error').toBe(false);

    // Check for page errors
    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    // Check for API errors (401, 500, etc.) - filter out non-critical errors
    const criticalNetworkErrors = networkErrors.filter(
      (err) =>
        err.includes('401') ||
        err.includes('500') ||
        err.includes('projects') // API calls to projects service
    );
    expect(
      criticalNetworkErrors,
      `Critical network errors: ${criticalNetworkErrors.join(', ')}`
    ).toHaveLength(0);

    // Verify page structure - should have either project cards or "Your projects" heading
    const hasProjects = await page.locator('a[href^="/projects/"]').count();
    const hasProjectsHeading = await page.locator('text=Your projects').isVisible().catch(() => false);
    const hasProjectsTitle = await page.locator('h1, h2').filter({ hasText: /project/i }).isVisible().catch(() => false);

    expect(
      hasProjects > 0 || hasProjectsHeading || hasProjectsTitle,
      'Should show projects content or heading'
    ).toBe(true);

    console.log(`Projects page loaded successfully with ${hasProjects} project cards`);
  });

  test('should display project cards when projects exist', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Look for project card links
    const projectLinks = page.locator('a[href^="/projects/"]');
    const count = await projectLinks.count();

    console.log(`Found ${count} project card(s)`);

    // Take screenshot
    await page.screenshot({ path: 'test-results/projects-cards.png', fullPage: true });

    // If projects exist, verify card structure
    if (count > 0) {
      const firstCard = projectLinks.first();
      await expect(firstCard).toBeVisible();

      // Get the href before clicking
      const href = await firstCard.getAttribute('href');
      expect(href).toMatch(/\/projects\/[^/]+/);

      // Click first project and wait for navigation
      await Promise.all([
        page.waitForURL(/\/projects\/[^/]+/),
        firstCard.click(),
      ]);

      // Take screenshot of project detail
      await page.screenshot({ path: 'test-results/project-detail.png', fullPage: true });
    }
  });

  test('should not have console errors about JSON parsing', async ({ page }) => {
    const jsonErrors: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('JSON') ||
        text.includes('Unexpected token') ||
        text.includes('SyntaxError') ||
        text.includes('parse')
      ) {
        jsonErrors.push(text);
      }
    });

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    expect(jsonErrors, `JSON parsing errors found: ${jsonErrors.join(', ')}`).toHaveLength(0);
  });

  test('should not show error boundary', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Check for error boundary indicators
    const errorBoundary = page.locator('[data-error-boundary], .error-boundary, text=Something went wrong');
    const hasErrorBoundary = await errorBoundary.isVisible().catch(() => false);

    expect(hasErrorBoundary, 'Should not show error boundary').toBe(false);

    // Check for "Try again" button which indicates an error state
    const tryAgainButton = page.locator('button:has-text("Try again")');
    const hasTryAgain = await tryAgainButton.isVisible().catch(() => false);

    expect(hasTryAgain, 'Should not show "Try again" button').toBe(false);
  });
});
