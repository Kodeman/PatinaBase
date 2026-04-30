import { test as base } from '@playwright/test';
import { Page } from '@playwright/test';

/**
 * Authentication fixture for Playwright tests.
 *
 * Signs in via the UI as the seeded designer (`designer@patina.dev` /
 * `password123`). The signin page collapses the email/password form behind
 * a "Sign in with email" disclosure, so we click that first.
 *
 * Override credentials via DESIGNER_E2E_EMAIL / DESIGNER_E2E_PASSWORD.
 */

const TEST_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev';
const TEST_PASSWORD = process.env.DESIGNER_E2E_PASSWORD ?? 'password123';

export type AuthenticatedPage = Page;

type AuthFixtures = {
  authenticatedPage: AuthenticatedPage;
};

async function setupAuthentication(page: Page): Promise<void> {
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto('/auth/signin?callbackUrl=%2Fportal', {
        timeout: 30_000,
        waitUntil: 'networkidle',
      });

      if (!page.url().includes('/auth/signin')) {
        return;
      }

      // Wait for React hydration so the disclosure click handler is bound.
      const disclosure = page.getByRole('button', { name: /sign in with email/i });
      await disclosure.waitFor({ state: 'visible', timeout: 15_000 });
      await disclosure.click();

      const emailInput = page.getByLabel(/email/i).first();
      await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
      await emailInput.fill(TEST_EMAIL);

      const passwordInput = page.getByLabel(/password/i).first();
      await passwordInput.fill(TEST_PASSWORD);

      // AuthForm renders submit button with submitText="Sign In" prop.
      await page.getByRole('button', { name: /^sign in$/i }).click();

      await page.waitForURL(
        /\/(portal|dashboard|catalog|clients|proposals|projects)/,
        { timeout: 60_000 },
      );
      return;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await page.waitForTimeout(500);
      }
    }
  }

  throw new Error(
    `Authentication failed after ${maxAttempts} attempts: ${lastError?.message ?? 'unknown'}`,
  );
}

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await setupAuthentication(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';

export async function isAuthenticated(page: Page): Promise<boolean> {
  const currentUrl = page.url();
  await page.goto('/portal');
  await page.waitForLoadState('networkidle');
  const isAuth = !page.url().includes('/auth/signin');
  if (currentUrl !== page.url() && !isAuth) {
    await page.goto(currentUrl);
  }
  return isAuth;
}

export async function signOut(page: Page): Promise<void> {
  await page.goto('/auth/signout');
  await page.waitForLoadState('networkidle');
  await page.waitForURL(/\/auth\/signin/, { timeout: 10_000 });
}
