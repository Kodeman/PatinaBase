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
      await page.goto('/auth/signin?callbackUrl=%2Fdesk', {
        timeout: 30_000,
        waitUntil: 'networkidle',
      });

      if (!page.url().includes('/auth/signin')) {
        return;
      }

      // Open the password panel. The golden-hour auth restyle (2026-08-06)
      // made sign-in email-first and renamed this disclosure from "Sign in
      // with email" to "Use email and password instead" (PortalAuth.tsx); both
      // spellings are matched so the fixture spans the change.
      const disclosure = page.getByRole('button', {
        name: /sign in with email|use email and password instead/i,
      });
      await disclosure.first().waitFor({ state: 'visible', timeout: 15_000 });
      await disclosure.first().click();

      const emailInput = page.getByLabel(/email/i).first();
      await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
      await emailInput.fill(TEST_EMAIL);

      const passwordInput = page.getByLabel(/password/i).first();
      await passwordInput.fill(TEST_PASSWORD);

      // AuthForm renders submit button with submitText="Sign In" prop.
      await page.getByRole('button', { name: /^sign in$/i }).click();

      // R21 dissolve: signin lands on the Desk. The other spellings are the
      // rooms a callbackUrl can name, plus /unauthorized so a role failure
      // fails the assertion below instead of timing out here.
      await page.waitForURL(
        /\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized)/,
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

/**
 * localStorage key the help-system uses to remember the first-sign-in welcome
 * modal was already shown (the Desk Walkthrough's welcome — see
 * components/document/help/desk-walkthrough.tsx). The modal
 * renders a <dialog> that makes the rest of the page inert/aria-hidden, which
 * breaks specs written before the modal existed. Pre-set it so the modal never
 * opens during e2e. (The guided tour only starts from the modal's CTA, so
 * suppressing the modal also suppresses the tour.)
 */
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await page.addInitScript((key) => {
      try {
        window.localStorage.setItem(key, '1');
      } catch {
        /* localStorage may be unavailable; ignore */
      }
    }, WELCOME_SHOWN_KEY);
    await setupAuthentication(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';

export async function signOut(page: Page): Promise<void> {
  await page.goto('/auth/signout');
  await page.waitForLoadState('networkidle');
  await page.waitForURL(/\/auth\/signin/, { timeout: 10_000 });
}
