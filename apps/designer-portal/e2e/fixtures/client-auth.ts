import { test as base, type Page, type BrowserContext } from '@playwright/test';

/**
 * Authentication fixture for the Client Portal (port 3002).
 *
 * Signs in via the UI as the seeded client (`client@patina.dev` / `password123`).
 * The signin page — like the designer portal — collapses the email/password form
 * behind a "Sign in with email" disclosure button, so we click that first.
 *
 * Uses a fresh BrowserContext so it never shares cookies with the designer fixture.
 *
 * Override credentials via CLIENT_E2E_EMAIL / CLIENT_E2E_PASSWORD.
 * Override the client-portal origin via CLIENT_PORTAL_URL.
 */

const CLIENT_BASE_URL = process.env.CLIENT_PORTAL_URL ?? 'http://localhost:3002';
const TEST_EMAIL = process.env.CLIENT_E2E_EMAIL ?? 'client@patina.dev';
const TEST_PASSWORD = process.env.CLIENT_E2E_PASSWORD ?? 'password123';

type ClientAuthFixtures = {
  clientContext: BrowserContext;
  clientPage: Page;
};

async function setupClientAuth(page: Page): Promise<void> {
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(`${CLIENT_BASE_URL}/auth/signin?callbackUrl=%2Fproposals`, {
        timeout: 30_000,
        waitUntil: 'networkidle',
      });

      // Already authenticated — redirected away from signin
      if (!page.url().includes('/auth/signin')) {
        return;
      }

      // Wait for React hydration so the disclosure click handler is bound.
      // The client-portal uses the same disclosure toggle as the designer portal:
      // a plain <button> with text "Sign in with email" that reveals AuthForm.
      const disclosure = page.getByRole('button', { name: /sign in with email/i });
      await disclosure.waitFor({ state: 'visible', timeout: 15_000 });
      await disclosure.click();

      // AuthForm renders labelled inputs: "Email Address" and "Password"
      const emailInput = page.getByLabel(/email address/i).first();
      await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
      await emailInput.fill(TEST_EMAIL);

      const passwordInput = page.getByLabel(/password/i).first();
      await passwordInput.fill(TEST_PASSWORD);

      // AuthForm submit button uses submitText="Sign In"
      await page.getByRole('button', { name: /^sign in$/i }).click();

      // Wait until the browser navigates away from the signin route
      await page.waitForURL((url) => !url.toString().includes('/auth/signin'), {
        timeout: 60_000,
      });
      return;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts) {
        await page.waitForTimeout(500);
      }
    }
  }

  throw new Error(
    `Client auth failed after ${maxAttempts} attempts: ${lastError?.message ?? 'unknown'}`,
  );
}

export const test = base.extend<ClientAuthFixtures>({
  clientContext: async ({ browser }, use) => {
    // Fresh context — no shared cookies or storage with the designer fixture
    const context = await browser.newContext({ storageState: undefined });
    await use(context);
    await context.close();
  },
  clientPage: async ({ clientContext }, use) => {
    const page = await clientContext.newPage();
    await setupClientAuth(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
