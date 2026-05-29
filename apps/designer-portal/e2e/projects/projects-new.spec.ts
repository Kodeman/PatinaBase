import { test, expect } from '../fixtures/auth';

/**
 * New Project wizard (/portal/projects/new) — the real 7-step activation wizard
 * (WizardShell + Step01..07 + useCreateProject / useActivationWizard).
 *
 * Replaces the previous spec, which asserted a long-removed "Sandbox · no API
 * calls yet" mockup at the bare /projects/new path. That path now 308-redirects
 * to the portal wizard (next.config redirects), so the old assertions failed.
 */
test.describe('New Project wizard — /portal/projects/new', () => {
  test('loads the activation wizard (step 1) without a runtime crash', async ({ authenticatedPage: page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/portal/projects/new');
    await page.waitForLoadState('networkidle');

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
    // Step 01 — Basics: the project-name field is the most stable anchor.
    await expect(page.locator('#aw-project-name')).toBeVisible();
    await expect(page.getByText('Project name', { exact: false }).first()).toBeVisible();
  });

  test('bare /projects/new redirects to the portal wizard', async ({ authenticatedPage: page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/portal\/projects\/new/);
  });
});
