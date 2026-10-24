import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const INQUIRY = 'SQ1970 Fictional Inquiry';

async function settledStudio(page: Page) {
  if (new URL(page.url()).pathname !== '/desk') await page.goto('/desk');
  const studio = page.locator('[data-studio="round8"]');
  await expect(studio).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  return studio;
}

test.describe('A01 studio journeys with live local rows', () => {
  test.setTimeout(180_000);

  test.afterEach(() => {
    // Only the inquiry made by this spec for the fictional F01 actor.
    psqlRun(`DELETE FROM public.leads WHERE designer_id = '${DESIGNER}' AND contact_name = '${INQUIRY}';`);
    expect(psqlScalar(`SELECT count(*) FROM public.leads WHERE designer_id = '${DESIGNER}' AND contact_name = '${INQUIRY}';`)).toBe('0');
  });

  test('register opens the real commission and Studio returns to its opener and filter', async ({ authenticatedPage: page }) => {
    const studio = await settledStudio(page);
    await studio.getByRole('button', { name: 'Studio', exact: true }).click();
    await expect(studio.getByRole('button', { name: 'Studio', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const opener = page.locator(`[data-studio-register-row="${JOB}"] a`);
    const name = psqlScalar(`SELECT name FROM public.projects WHERE id = '${JOB}';`);
    await expect(opener).toHaveText(name);
    await expect(opener).toHaveAttribute('href', `/doc/${JOB}`);
    await opener.click();
    await expect(page.locator('[data-job-head]')).toContainText(name, { timeout: 60_000 });
    await page.locator('[data-job-head-return]').click();
    await settledStudio(page);
    await expect(opener).toBeFocused({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Studio', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_OUTPUT_DIR}/register-${test.info().project.name}.png`, fullPage: true });
  });

  test('denied optional image falls back silently without losing the live job', async ({ authenticatedPage: page }) => {
    await settledStudio(page);
    let denied = 0;
    // Fault injection only: the job/roster remain live; no board or private media is written.
    await page.route('**/rest/v1/proposal_boards?**', async (route) => {
      if (new URL(route.request().url()).searchParams.get('select') !== 'project_id,proposal_id,cover_image_url,updated_at') {
        await route.continue();
        return;
      }
      await route.fulfill({ json: [{ project_id: JOB, proposal_id: null, cover_image_url: 'http://localhost:3420/sq1970-denied-cover.png', updated_at: '2026-10-24T00:00:00Z' }] });
    });
    await page.route('**/sq1970-denied-cover.png', async (route) => {
      denied++;
      await route.fulfill({ status: 403, body: 'Fixture image denial' });
    });
    await page.reload();
    await settledStudio(page);
    await expect.poll(() => denied).toBeGreaterThan(0);
    const featured = page.locator(`[data-studio-featured="${JOB}"]`);
    await expect(featured.locator('img')).toHaveCount(0);
    await expect(featured.locator('figcaption')).toHaveCount(0);
    await expect(featured.getByRole('heading', { name: 'F01 Fictional Full-Service House' })).toBeVisible();
    await expect(featured.getByRole('link', { name: /Open the job paper/ })).toHaveAttribute('href', `/doc/${JOB}`);
    await expect(page.locator('[data-studio-register-row] img')).toHaveCount(0);
    await expect(page.locator('[data-sonner-toast], [role="alert"]')).toHaveCount(0);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_OUTPUT_DIR}/image-denial-${test.info().project.name}.png`, fullPage: true });
  });

  test('recorded inquiry opens its own brief and returns to the persistent inquiry row', async ({ authenticatedPage: page }) => {
    await settledStudio(page);
    await page.getByRole('button', { name: 'Record an inquiry', exact: true }).click();
    await page.getByLabel('Client name').fill(INQUIRY);
    await page.getByLabel('Project summary').fill('Fictional studio journey, local test only.');
    await page.getByRole('button', { name: 'Create inquiry brief', exact: true }).click();
    await expect.poll(() => psqlScalar(`SELECT count(*) FROM public.leads WHERE designer_id = '${DESIGNER}' AND contact_name = '${INQUIRY}';`)).toBe('1');
    const id = psqlScalar(`SELECT id FROM public.leads WHERE designer_id = '${DESIGNER}' AND contact_name = '${INQUIRY}';`);
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    const opener = page.locator(`#studio-recorded-${id}`);
    await expect(opener).toHaveAttribute('href', `/doc/${id}`);
    await opener.click();
    await expect(page).toHaveURL(new RegExp(`/doc/${id}(\\?|$)`));
    await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 60_000 });
    // Inquiry documents retain the pre-work frame; browser Back is their return.
    await page.goBack();
    await settledStudio(page);
    const row = page.locator(`#studio-inquiry-${id}`);
    await expect(row).toBeFocused({ timeout: 30_000 });
    await expect(row).toHaveAttribute('href', `/doc/${id}`);
    expect(psqlScalar(`SELECT project_description FROM public.leads WHERE id = '${id}' AND designer_id = '${DESIGNER}';`)).toBe('Fictional studio journey, local test only.');
  });

  test('an unrelated fictional designer sees a truthful empty studio, not the F01 commission', async ({ page }) => {
    // Playwright's fresh test context never signs in as the primary fixture actor.
    await page.addInitScript(() => {
      localStorage.setItem('help-system.welcome-shown.first-project-walkthrough', '1');
    });
    await page.goto('/auth/signin?callbackUrl=%2Fdesk');
    await page.getByRole('button', { name: /sign in with email|use email and password instead|use a password instead/i }).first().click();
    await page.getByLabel(/email/i).first().fill('f01-outsider@test.invalid');
    await page.getByLabel(/password/i).first().fill('password123');
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/desk(\?|$)/, { timeout: 60_000 });
    await settledStudio(page);
    await expect(page.getByText('No project files yet. Record an inquiry or create a project file to begin.')).toBeVisible();
    await expect(page.locator('[data-studio-register-row]')).toHaveCount(0);
    await expect(page.getByText('No inquiries waiting.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record an inquiry', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create a project file', exact: true })).toBeVisible();
  });
});
