import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start from the home page
    await page.goto('/');
  });

  test('should redirect unauthenticated users to signin', async ({ page }) => {
    // Try to access protected route
    await page.goto('/dashboard');

    // Should redirect to signin with callback URL
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.url()).toContain('callbackUrl=%2Fdashboard');
  });

  test('should display signin page correctly', async ({ page }) => {
    await page.goto('/auth/signin');

    await expect(page.getByRole('heading', { name: /Welcome back to the studio/i })).toBeVisible();
    await expect(page.getByText(/their clients, and the makers they trust/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Email me a one-time code/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Use email and password instead/i })).toBeVisible();
    // The QR left the right pane for the brand pane's ambient badge.
    await expect(page.getByRole('button', { name: /Use a QR code/i })).toHaveCount(0);
  });

  test('shows the ambient QR badge in the brand pane on a desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/auth/signin');

    await expect(page.getByTestId('portal-auth-qr')).toBeVisible();
  });

  test('never renders or generates a QR below the lg breakpoint', async ({ page }) => {
    // The viewport gate is folded into the hook's `enabled`, so the cost to the
    // shared 10/min IP limiter on a phone must be exactly zero requests — not
    // merely a badge hidden by CSS.
    const generateRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/qr/generate')) generateRequests.push(request.url());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/auth/signin');
    await expect(page.getByRole('button', { name: /Email me a one-time code/i })).toBeVisible();
    // Give a hydrated media-query gate every chance to misfire before asserting.
    await page.waitForTimeout(2_000);

    await expect(page.getByTestId('portal-auth-qr')).toHaveCount(0);
    expect(generateRequests).toEqual([]);
  });

  test('should display error messages on signin page', async ({ page }) => {
    // Test SessionExpired error
    await page.goto('/auth/signin?error=SessionExpired');
    await expect(page.getByText(/Your session ended/i)).toBeVisible();
    await expect(page.getByText(/Your saved studio work is still here/i)).toBeVisible();

    // Test AccessDenied error
    await page.goto('/auth/signin?error=AccessDenied');
    await expect(page.getByText(/This account can’t open the studio/i)).toBeVisible();
  });

  test('should keep the approved sign-in methods in order', async ({ page }) => {
    await page.goto('/auth/signin');

    const labels = await page.getByRole('button').allTextContents();
    const emailIndex = labels.findIndex((label) => label.includes('Email me a one-time code'));
    const appleIndex = labels.findIndex((label) => label.includes('Continue with Apple'));
    const passwordIndex = labels.findIndex((label) => label.includes('Use email and password instead'));

    expect(emailIndex).toBeGreaterThanOrEqual(0);
    expect(labels.some((label) => label.includes('Use a QR code'))).toBe(false);
    if (appleIndex >= 0) expect(appleIndex).toBeGreaterThan(emailIndex);
    expect(passwordIndex).toBeGreaterThan(appleIndex >= 0 ? appleIndex : emailIndex);
  });
});

test.describe('Protected Routes', () => {
  test('should protect designer routes', async ({ page }) => {
    const protectedRoutes = [
      '/dashboard',
      '/clients',
      '/catalog',
      '/proposals',
      '/projects',
      '/messages',
      '/teaching',
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth\/signin/);
    }
  });

  test('should redirect to correct dashboard based on role', async ({ page, context }) => {
    // This test requires mocking authenticated sessions
    // You would use Playwright's context.addCookies() or similar
    // to inject session cookies for different user roles

    // Example structure (needs actual session implementation):
    /*
    await context.addCookies([{
      name: 'sb-local-auth-token',
      value: 'mock-supabase-session',
      domain: 'localhost',
      path: '/',
    }]);

    await page.goto('/auth/signin');
    await expect(page).toHaveURL('/dashboard'); // Designer dashboard
    */
  });
});

test.describe('Session Management', () => {
  test('should display session expiry warning', async ({ page, context }) => {
    // This test requires setting up a session that's about to expire
    // You would need to mock the session data with an expiry time

    // Example test structure:
    /*
    // Set up session expiring in 4 minutes
    await setupMockSession(context, { expiresIn: 4 * 60 * 1000 });

    await page.goto('/dashboard');

    // Wait for expiry warning to appear (shown 5 minutes before expiry)
    await expect(page.getByText(/Session Expiring Soon/i)).toBeVisible();

    // Check refresh button
    await expect(page.getByRole('button', { name: /Stay Signed In/i })).toBeVisible();
    */
  });

  test('should handle session refresh', async ({ page, context }) => {
    // Test session refresh on window focus
    // This requires mocking session refresh API calls

    // Example test structure:
    /*
    await setupAuthenticatedSession(context);
    await page.goto('/dashboard');

    // Blur and focus window
    await page.evaluate(() => window.blur());
    await page.evaluate(() => window.focus());

    // Verify session refresh was called (check network requests)
    */
  });
});

test.describe('Error Handling', () => {
  test('should display error page for authentication errors', async ({ page }) => {
    await page.goto('/auth/error?error=AccessDenied');

    // `?error=AccessDenied` selects its own entry in ERROR_CONFIGS (auth/error/page.tsx)
    // — 'Access Denied', not the 'Authentication Error' default — and the way back
    // is a link to /auth/signin, not a 'Try Again' button.
    await expect(page.getByRole('heading', { name: /Access Denied/i })).toBeVisible();
    await expect(page.getByText(/You do not have the required permissions/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to Sign In/i })).toBeVisible();
  });

  test('should handle API 401 errors', async ({ page, context }) => {
    // This test requires mocking API responses
    /*
    await setupAuthenticatedSession(context);
    await page.goto('/dashboard');

    // Mock API 401 response
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      });
    });

    // Trigger API call
    await page.click('[data-testid="load-data"]');

    // Should redirect to signin
    await expect(page).toHaveURL(/\/auth\/signin/);
    */
  });
});

test.describe('Signout Flow', () => {
  test('should handle signout correctly', async ({ page, context }) => {
    // This requires authenticated session
    /*
    await setupAuthenticatedSession(context);
    await page.goto('/dashboard');

    // Click user menu and signout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="signout-button"]');

    // Should redirect to signout page and then home
    await expect(page).toHaveURL('/');

    // Session should be cleared
    const cookies = await context.cookies();
    expect(cookies.find(c => c.name.includes('session'))).toBeUndefined();
    */
  });

  test('should display signout page', async ({ page }) => {
    await page.goto('/auth/signout');

    await expect(page.getByText(/Signing out/i)).toBeVisible();
  });
});

test.describe('Role-Based Access Control (RBAC)', () => {
  test('should hide admin routes for non-admin users', async ({ page, context }) => {
    // Mock designer session
    /*
    await setupMockSession(context, { roles: ['designer'] });
    await page.goto('/admin/dashboard');

    // Should redirect to error page
    await expect(page).toHaveURL(/\/auth\/error.*AccessDenied/);
    */
  });

  test('should show/hide UI elements based on permissions', async ({ page, context }) => {
    // Mock client session
    /*
    await setupMockSession(context, { roles: ['client'] });
    await page.goto('/proposals/123');

    // Client should see proposal but not edit buttons
    await expect(page.getByTestId('proposal-content')).toBeVisible();
    await expect(page.getByRole('button', { name: /Edit/i })).not.toBeVisible();
    */
  });
});

// Helper functions for session mocking (to be implemented)
async function setupAuthenticatedSession(context: any, options?: any) {
  // Implementation would add session cookies
  // This is a placeholder for the actual implementation
}

async function setupMockSession(context: any, options: { roles?: string[], expiresIn?: number }) {
  // Implementation would set up session with specific roles and expiry
  // This is a placeholder for the actual implementation
}
