import { test, expect } from '@playwright/test';

// Test helper to check for console errors and page errors
const setupErrorListeners = (page: any) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg: any) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error: Error) => {
    pageErrors.push(error.message);
  });

  return { consoleErrors, pageErrors };
};

test.describe('Client Portal - Smoke Tests', () => {
  test('Homepage (/) should load without errors', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/');

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Check that body has content
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(0);

    // Check for errors
    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    // Check for critical console errors (module not found, etc.)
    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Sign-in page (/auth/signin) should load without errors', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/auth/signin');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(0);

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Auth error page (/auth/error) should load without errors', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/auth/error');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(0);

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Dashboard (/dashboard) navigation test', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Check if redirected to login (expected for protected pages)
    const url = page.url();
    const isRedirected = url.includes('/auth/signin') || url.includes('/api/auth');

    if (!isRedirected) {
      // If not redirected, page should load with content
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(0);
    }

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Projects page (/projects) navigation test', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const isRedirected = url.includes('/auth/signin') || url.includes('/api/auth');

    if (!isRedirected) {
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(0);
    }

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Timeline page (/timeline) navigation test', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/timeline');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const isRedirected = url.includes('/auth/signin') || url.includes('/api/auth');

    if (!isRedirected) {
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(0);
    }

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Notifications page (/notifications) navigation test', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const isRedirected = url.includes('/auth/signin') || url.includes('/api/auth');

    if (!isRedirected) {
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(0);
    }

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Profile page (/profile) navigation test', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const isRedirected = url.includes('/auth/signin') || url.includes('/api/auth');

    if (!isRedirected) {
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(0);
    }

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Settings page (/settings) navigation test', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const isRedirected = url.includes('/auth/signin') || url.includes('/api/auth');

    if (!isRedirected) {
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(0);
    }

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Project detail page (/project/test-id) navigation test', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/project/550e8400-e29b-41d4-a716-446655440000');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const isRedirected = url.includes('/auth/signin') || url.includes('/api/auth');

    if (!isRedirected) {
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(0);
    }

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Milestone detail page navigation test', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/project/550e8400-e29b-41d4-a716-446655440000/milestone/milestone-123');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const isRedirected = url.includes('/auth/signin') || url.includes('/api/auth');

    if (!isRedirected) {
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(0);
    }

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  test('Approval detail page navigation test', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorListeners(page);

    await page.goto('/project/550e8400-e29b-41d4-a716-446655440000/approval/approval-123');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const isRedirected = url.includes('/auth/signin') || url.includes('/api/auth');

    if (!isRedirected) {
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(0);
    }

    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('Module not found') ||
      err.includes('Cannot find module') ||
      err.includes('Failed to fetch') ||
      err.includes('404')
    );
    expect(criticalErrors, `Critical console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });
});
