import { test as base } from '@playwright/test';
import { Page } from '@playwright/test';
import { WaitHelpers } from '../utils/wait-helpers';

/**
 * Authentication fixture for Playwright tests
 *
 * This fixture provides authenticated page contexts for testing protected routes.
 * In development mode, the application accepts any credentials via the dev-credentials provider.
 */

export type AuthenticatedPage = Page;

type AuthFixtures = {
  authenticatedPage: AuthenticatedPage;
};

/**
 * Setup authentication by signing in through the UI
 * This works because in development mode, the app accepts any credentials
 */
async function setupAuthentication(page: Page): Promise<void> {
  // Retry logic for authentication
  const maxRetries = 3;
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    try {
      attempt++;

      // Navigate to sign in page
      await page.goto('/auth/signin', { timeout: 30000, waitUntil: 'networkidle' });

      // Wait for the sign in page to load
      await page.waitForLoadState('networkidle', { timeout: 10000 });

      // Check if we need to sign in (might already be signed in from previous tests)
      const isSignInPage = await page.url().includes('/auth/signin');

      if (isSignInPage) {
        // Look for development credentials form
        const emailInput = page.locator('input[type="email"]');
        const passwordInput = page.locator('input[type="password"]');

        // Check if development credentials provider is available
        const hasDevCredentials = await emailInput.isVisible().catch(() => false);

        if (hasDevCredentials) {
          // Fill in development credentials
          await emailInput.fill('dev@patina.com');
          await passwordInput.fill('password');

          // Submit the form
          const signInButton = page.getByRole('button', { name: /sign in/i });
          await signInButton.click();

          // Wait for redirect after successful sign in with increased timeout
          await page.waitForURL(/\/(dashboard|catalog|clients|proposals|projects)/, { timeout: 60000 });
        } else {
          // Check if OIDC sign in is available
          const oidcButton = page.getByRole('button', { name: /sign in with oci/i });
          const hasOIDC = await oidcButton.isVisible().catch(() => false);

          if (hasOIDC) {
            throw new Error(
              'OIDC authentication detected. For E2E tests, please configure development credentials by removing OIDC environment variables or setting up a test OIDC provider.'
            );
          } else {
            throw new Error(
              'No authentication method found. Please ensure the app is running in development mode with dev-credentials provider enabled.'
            );
          }
        }
      }
      // Successfully authenticated, break out of retry loop
      return;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        console.log(`Authentication attempt ${attempt} failed, retrying...`);
        // Wait for network to settle before retrying
        await WaitHelpers.waitForNetworkIdle(page);
      }
    }
  }

  // If all retries failed, throw the last error
  throw new Error(`Authentication failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Extend Playwright test with authenticated page fixture
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Setup authentication before each test
    await setupAuthentication(page);

    // Provide the authenticated page to the test
    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Helper function to check if a page is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  // Navigate to a protected route and check if we're redirected to sign in
  const currentUrl = page.url();
  await page.goto('/catalog');
  await page.waitForLoadState('networkidle');

  const isAuth = !page.url().includes('/auth/signin');

  // Go back to original URL if needed
  if (currentUrl !== page.url() && !isAuth) {
    await page.goto(currentUrl);
  }

  return isAuth;
}

/**
 * Helper function to sign out
 */
export async function signOut(page: Page): Promise<void> {
  await page.goto('/auth/signout');
  await page.waitForLoadState('networkidle');
  // Wait for sign out to complete by checking if redirected to sign in page
  await page.waitForURL(/\/auth\/signin/, { timeout: 10000 });
}
